/**
 * meridian-breaker/breaker — the decision core, with no cordis in it.
 *
 * Everything here is host-plane code reacting to an already-parsed response.
 * No model is consulted, no agent tool call is issued, nothing waits on an LLM
 * noticing anything. That is the entire point: this must behave identically
 * every time, including when the model that would otherwise handle it is
 * exactly what cannot be reached.
 *
 * The module is deliberately free of any dsh/cordis import so the whole
 * decision path can be driven directly by tests.
 */

import { isTranscriptBacklogFailure, type FailureLike } from "./detect";
import * as latch from "./latch";
import { buildPrompt, type Choice, type Prompt } from "./prompt";
import {
  cachePaths,
  runCeilingMitigation,
  runRemedy,
  type RemedyPorts,
} from "./remedy";

/** How the plugin should answer the `agent/request-error` waterfall. */
export type Decision =
  /** Not our error, or the pause ended without a repair: call `next()` untouched. */
  | { readonly kind: "fall-through"; readonly reason: string }
  /** Repaired: return `{kind:'retry'}` so the loop retries on its ORIGINAL rung. */
  | { readonly kind: "retry"; readonly reason: string };

/** Asks the user. The live implementation drives a dsh dialog. */
export interface Prompter {
  ask(prompt: Prompt): Promise<Choice>;
}

/** Minimal logging surface; every method optional at the call site. */
export interface BreakerLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

/** Everything the core needs, all injected. */
export interface BreakerDeps {
  readonly ports: RemedyPorts;
  readonly prompter: Prompter;
  readonly logger?: BreakerLogger;
  /** Notified whenever a user-visible message should be shown outside the dialog. */
  readonly notify?: (message: string) => void;
}

function log(logger: BreakerLogger | undefined, level: "info" | "warn" | "error", message: string): void {
  logger?.[level]?.(`meridian-breaker: ${message}`);
}

/**
 * Drive the whole pause for the session that SET the latch: prompt once, run
 * the chosen action, and settle the latch so every joined session wakes.
 *
 * Wrapped so that ANY throw still settles the latch. A prompter that rejects
 * must not leave every session in the process wedged behind a pause nobody
 * will clear.
 */
async function drivePause(deps: BreakerDeps): Promise<void> {
  try {
    let unit: string | undefined;
    try {
      unit = (await deps.ports.service.resolve())?.unit;
    } catch {
      unit = undefined;
    }

    const paths = cachePaths(deps.ports.cacheDir);
    const prompt = buildPrompt({ unit, paths, pausedSessions: latch.waiterCount() });

    const choice = await deps.prompter.ask(prompt);

    if (choice === "decline") {
      // Declining means "let it fail normally", never "stay paused".
      log(deps.logger, "info", "user declined; releasing the pause and resuming the normal failure path");
      latch.settle({ kind: "declined" });
      return;
    }

    if (choice === "ceiling") {
      const result = await runCeilingMitigation(deps.ports);
      if (result.kind === "done") {
        log(deps.logger, "info", `raised ${result.value} on ${result.unit}; resuming paused chains`);
        latch.settle({ kind: "remedied" });
        return;
      }
      if (result.kind === "unresolved-service") {
        const message = unresolvedMessage(paths);
        log(deps.logger, "error", message);
        deps.notify?.(message);
        latch.settle({ kind: "failed", reason: message });
        return;
      }
      log(deps.logger, "error", result.reason);
      deps.notify?.(`meridian-breaker could not raise the ceiling: ${result.reason}`);
      latch.settle({ kind: "failed", reason: result.reason });
      return;
    }

    const result = await runRemedy(deps.ports);
    if (result.kind === "done") {
      log(deps.logger, "info", `cleared the meridian backlog via ${result.unit}; resuming paused chains`);
      latch.settle({ kind: "remedied" });
      return;
    }
    if (result.kind === "unresolved-service") {
      const message = unresolvedMessage(result.paths);
      log(deps.logger, "error", message);
      deps.notify?.(message);
      latch.settle({ kind: "failed", reason: message });
      return;
    }
    log(deps.logger, "error", result.reason);
    deps.notify?.(`meridian-breaker did NOT repair meridian: ${result.reason}`);
    latch.settle({ kind: "failed", reason: result.reason });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(deps.logger, "error", `pause aborted: ${reason}`);
    latch.settle({ kind: "failed", reason });
  }
}

/**
 * The honest message when the unit cannot be resolved: say so, and name the two
 * paths. Never claim to have fixed anything.
 */
export function unresolvedMessage(paths: readonly string[]): string {
  return (
    "meridian-breaker could not find the meridian service unit, so it stopped nothing and deleted nothing. " +
    "Nothing has been repaired. Stop meridian yourself, then delete these two files, then start it again:\n" +
    paths.map((p) => `  - ${p}`).join("\n")
  );
}

/**
 * Handle one failed model request.
 *
 * @param failure - the `LlmFailure` from `agent/request-error`.
 * @param deps - injected ports.
 * @returns whether the caller should retry on its original rung or fall through.
 */
export async function handleRequestError(
  failure: FailureLike | undefined,
  deps: BreakerDeps,
): Promise<Decision> {
  if (!isTranscriptBacklogFailure(failure)) {
    return { kind: "fall-through", reason: "not the transcript-backlog failure" };
  }

  const joined = latch.join();
  if (joined.first) {
    log(deps.logger, "warn", "meridian transcript backlog is full; pausing every chain and asking once");
    // Deliberately not awaited here: `drivePause` settles the latch, and this
    // chain waits on the same promise as every joiner below.
    void drivePause(deps);
  } else {
    log(deps.logger, "info", "joining the pause already in effect; raising no second prompt");
  }

  const outcome = await joined.outcome;

  switch (outcome.kind) {
    case "remedied":
      return { kind: "retry", reason: "meridian repaired; retrying on the original rung" };
    case "declined":
      return { kind: "fall-through", reason: "user declined; normal failure path" };
    case "failed":
      return { kind: "fall-through", reason: `remedy failed: ${outcome.reason}` };
  }
}
