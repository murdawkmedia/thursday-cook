/**
 * meridian-breaker — one recurring meridian failure, turned into a diagnosed,
 * one-click recovery.
 *
 * ── The seam ─────────────────────────────────────────────────────────────
 *
 * This plugin listens on the `agent/request-error` recovery waterfall, which is
 * the agent loop's ONE decision point for a failed model request:
 *
 *   dsh-agent-loop/lib/index.js:653
 *     const action = await this.dispatch.waterfall("agent/request-error", {...},
 *                                                 () => Promise.resolve(void 0));
 *   dsh-agent-loop/lib/index.js:662
 *     if (action?.kind !== "retry") throw new LlmError(...);   // terminal
 *     continue;                                                // retry the step
 *
 * That is the right seam because it is where the failover decision is MADE, not
 * merely observed. The rung advance we must prevent lives in one listener on
 * this same waterfall:
 *
 *   dotfiles-ai/plugins/profiles.ts:567   s.cursor += 1;      // advance a rung
 *   dotfiles-ai/plugins/profiles.ts:559   markDown(cur, ...); // poison the rung
 *   dotfiles-ai/plugins/profiles.ts:575   return { kind: "retry" };
 *
 * `s.cursor` IS the chain index. Because a waterfall listener that does not call
 * `next()` stops the chain, registering FIRST and holding without calling
 * `next()` means profiles.ts never runs, so the cursor is never incremented and
 * the rung is never marked down. The chain halts exactly where it is.
 *
 * Registration order is guaranteed, not hoped for: cordis `ctx.on(name, fn,
 * options)` treats a boolean third argument as `prepend`
 * (cordis/lib/index.js:372 `if (typeof options !== "object") options = { prepend: options }`)
 * and prepends with `unshift` (cordis/lib/index.js:336). profiles.ts registers
 * with the two-argument form, so it always appends. This plugin is therefore
 * ahead of it regardless of plugin load order.
 *
 * After a successful remedy we return `{ kind: "retry" }`, the loop `continue`s
 * and re-enters the `agent/request` waterfall, where profiles.ts selects
 * `s.levels[s.cursor]` — with the cursor UNCHANGED. The turn resumes on its
 * original rung and completes rather than failing.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * No model call, no agent tool call, no dependency on an LLM noticing anything.
 * Detection, pause, prompt and remedy are all host-plane code reacting to a
 * parsed response. The whole value is that it behaves identically every time,
 * including when the model that would otherwise handle it is exactly what
 * cannot be reached.
 */

import type { Context } from "@deepseek-ai/cordis";
// Importing this type also loads dsh-agent's `declare module
// '@deepseek-ai/cordis'` block (dsh-agent/lib/types/runtime-types.d.ts:134),
// which is what puts "agent/request-error" in cordis's Events map.
import type { RequestErrorAction } from "@deepseek-ai/dsh-agent";
import z from "@deepseek-ai/schemastery";
import { handleRequestError, type BreakerDeps, type Prompter } from "./breaker";
import * as latch from "./latch";
import { buildPrompt, type Choice, type Prompt } from "./prompt";
import type { RemedyPorts } from "./remedy";
import { defaultCacheDir, nodeFileOps, systemdServiceControl } from "./systemd";

export const name = "meridian-breaker";

export const Config = z.object({
  /** Override the meridian cache directory. Defaults to $XDG_CACHE_HOME/meridian. */
  cacheDir: z.string().default(""),
});

/**
 * Hand-written companion to the runtime schema, matching the house convention
 * in dotfiles-ai/plugins/profiles.ts:131. `apply` accepts `unknown` because the
 * manifest supplies this value and a malformed row must not crash the plugin.
 */
type BreakerConfig = {
  cacheDir?: string;
};

/**
 * The slice of `@deepseek-ai/dsh-user-questions` this plugin uses. Declared
 * structurally rather than imported so the plugin still loads when no
 * user-questions provider is mounted; `ask()` is looked up at call time.
 */
interface AskAnswerItem {
  readonly id: string;
  readonly selected: string[];
  readonly custom?: string;
}
interface UserQuestionsLike {
  ask(request: {
    questions: {
      id: string;
      header?: string;
      question: string;
      detail?: string;
      options?: { label: string; description?: string }[];
    }[];
  }): Promise<{ answers: AskAnswerItem[] }>;
}

/**
 * Ask through `ctx.userQuestions`.
 *
 * The request deliberately carries NO `agent`. The pause is process-global and
 * may be opened by any session, including an owned child; `ask()` rejects a
 * delegated caller with `DELEGATED_CALLER` and would block a child forever
 * (dsh-user-questions index.d.ts). Omitting the agent addresses the dialog to
 * the human at the UI rather than to one session's turn.
 */
function makePrompter(ctx: Context): Prompter | undefined {
  const questions = ctx.get("userQuestions") as UserQuestionsLike | undefined;
  if (questions === undefined) return undefined;
  return {
    async ask(prompt: Prompt): Promise<Choice> {
      const answer = await questions.ask({
        questions: [
          {
            id: "meridian-backlog",
            header: prompt.title,
            question: "meridian's session transcript backlog is full. How should I proceed?",
            detail: prompt.body,
            options: prompt.options.map((o) => ({ label: o.label, description: o.detail })),
          },
        ],
      });
      const selected = answer.answers.find((a) => a.id === "meridian-backlog")?.selected ?? [];
      const chosen = prompt.options.find((o) => selected.includes(o.label));
      // An unrecognized or empty answer is treated as a decline: the safe
      // reading of "no clear yes" is to let the normal failure path proceed,
      // never to keep every session paused.
      return chosen?.id ?? "decline";
    },
  };
}

export function apply(ctx: Context, config: unknown = {}): void {
  const cfg = (typeof config === "object" && config !== null ? config : {}) as BreakerConfig;
  const configured = typeof cfg.cacheDir === "string" ? cfg.cacheDir.trim() : "";
  const ports: RemedyPorts = {
    service: systemdServiceControl,
    files: nodeFileOps,
    cacheDir: configured !== "" ? configured : defaultCacheDir(),
  };

  const dispose = ctx.on(
    "agent/request-error",
    (payload: unknown, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction> => {
      const p = payload as { failure?: unknown; signal?: AbortSignal };

      // A user abort is never a breaker trigger.
      if (p.signal?.aborted === true) return next();

      const prompter = makePrompter(ctx);
      if (prompter === undefined) {
        // With no UI to ask, there is no one-click recovery to offer. Fall
        // through untouched rather than pausing behind a dialog that can
        // never appear.
        return next();
      }

      const deps: BreakerDeps = {
        ports,
        prompter,
        logger: {
          info: (m) => ctx.logger.info(m),
          warn: (m) => ctx.logger.warn(m),
          error: (m) => ctx.logger.error(m),
        },
      };

      return handleRequestError(p.failure as never, deps).then((decision) => {
        if (decision.kind === "retry") return { kind: "retry" } as const;
        return next();
      });
    },
    // prepend: run ahead of the failover walker so the chain cannot advance.
    true,
  );

  ctx.effect(
    () => () => {
      dispose();
      // Never leave a session parked on a latch this plugin can no longer clear.
      latch.settle({ kind: "failed", reason: "meridian-breaker disposed" });
    },
    "meridian-breaker: release the pause and drop the listener",
  );
}

export { buildPrompt };
