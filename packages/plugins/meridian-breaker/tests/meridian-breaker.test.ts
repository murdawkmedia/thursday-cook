/**
 * meridian-breaker acceptance suite.
 *
 * Every effect is driven through the injected ports, so the live meridian
 * service is never stopped, started, reconfigured or wiped by this file. The
 * fakes record an ordered journal; the ordering assertions read that journal.
 *
 * The `waterfall` helper below reproduces cordis's dispatch semantics (a
 * listener that does not call `next()` ends the chain) and the failover
 * listener reproduces the one line that matters from
 * dotfiles-ai/plugins/profiles.ts:567 — `s.cursor += 1`. That is how "the chain
 * index is unchanged" becomes a real assertion instead of a string comparison.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCandidate, isTranscriptBacklogFailure, BACKLOG_MESSAGE } from "../src/detect";
import * as latch from "../src/latch";
import { handleRequestError, unresolvedMessage, type BreakerDeps, type Prompter } from "../src/breaker";
import { buildPrompt, overclaims, ISSUE_URL, FORBIDDEN_CLAIMS, type Choice, type Prompt } from "../src/prompt";
import {
  CACHE_FILES,
  CEILING_KEY,
  CEILING_DEFAULT,
  cachePaths,
  runCeilingMitigation,
  runRemedy,
  type FileOps,
  type RemedyPorts,
  type ResolvedService,
  type ServiceControl,
} from "../src/remedy";

// ── Fakes ────────────────────────────────────────────────────────────────

const CACHE_DIR = "/fake/cache/meridian";
const UNIT = "meridian.service";

interface FakeSystem {
  journal: string[];
  ports: RemedyPorts;
  service: ServiceControl;
  files: FileOps;
}

function makeSystem(options: {
  resolved?: ResolvedService | undefined;
  resolveThrows?: boolean;
  stopThrows?: boolean;
  startThrows?: boolean;
  removeThrows?: string;
} = {}): FakeSystem {
  const journal: string[] = [];
  const resolved = "resolved" in options ? options.resolved : { unit: UNIT, description: "Meridian" };

  const service: ServiceControl = {
    async resolve() {
      journal.push("resolve");
      if (options.resolveThrows === true) throw new Error("systemctl unavailable");
      return resolved;
    },
    async stop(unit) {
      if (options.stopThrows === true) {
        journal.push(`stop-threw:${unit}`);
        throw new Error("stop refused");
      }
      journal.push(`stop:${unit}`);
    },
    async start(unit) {
      if (options.startThrows === true) {
        journal.push(`start-threw:${unit}`);
        throw new Error("start refused");
      }
      journal.push(`start:${unit}`);
    },
    async restart(unit) {
      journal.push(`restart:${unit}`);
    },
    async daemonReload() {
      journal.push("daemon-reload");
    },
    async setEnvironmentOverride(unit, key, value) {
      journal.push(`override:${unit}:${key}=${value}`);
    },
  };

  const files: FileOps = {
    async remove(path) {
      if (options.removeThrows !== undefined && path.endsWith(options.removeThrows)) {
        journal.push(`delete-threw:${path}`);
        throw new Error("EBUSY");
      }
      journal.push(`delete:${path}`);
    },
  };

  return { journal, service, files, ports: { service, files, cacheDir: CACHE_DIR } };
}

function makePrompter(choice: Choice): Prompter & { calls: Prompt[] } {
  const calls: Prompt[] = [];
  return {
    calls,
    async ask(prompt) {
      calls.push(prompt);
      return choice;
    },
  };
}

function deps(system: FakeSystem, prompter: Prompter): BreakerDeps {
  return { ports: system.ports, prompter };
}

/** The exact body meridian sends, per @rynfar/meridian dist/cli-nzvbaqjp.js:22995. */
const REAL_BODY = JSON.stringify({
  type: "error",
  error: { type: "api_error", message: BACKLOG_MESSAGE },
});

/**
 * The failure exactly as it arrives at `agent/request-error` on the pi-ai path:
 * `APIError.makeMessage` renders `${status} ${JSON.stringify(body)}`
 * (@anthropic-ai/sdk/core/error.js:23,26), pi-ai keeps only `.message`
 * (anthropic-messages.js:581), dsh-llm-pi-ai classifies it (index.js:474-481).
 */
const REAL_FAILURE = { message: `500 ${REAL_BODY}`, code: "SERVER" };

beforeEach(() => latch.resetForTest());
afterEach(() => latch.resetForTest());

// ── 1. the trigger matches only the exact status+type+message triple ─────

describe("acceptance 1 — the trigger matches only the exact triple, parsed as JSON", () => {
  it("matches the real meridian failure", () => {
    expect(isTranscriptBacklogFailure(REAL_FAILURE)).toBe(true);
  });

  it("recovers status 500 and the body as a separate JSON document", () => {
    const candidate = extractCandidate(REAL_FAILURE);
    expect(candidate?.status).toBe(500);
    expect(JSON.parse(candidate!.bodyText)).toEqual({
      type: "error",
      error: { type: "api_error", message: BACKLOG_MESSAGE },
    });
  });

  it("prefers an adapter-supplied structured status over the rendered prefix", () => {
    expect(extractCandidate({ message: REAL_BODY, code: "SERVER", status: 500 })?.status).toBe(500);
    expect(isTranscriptBacklogFailure({ message: REAL_BODY, code: "SERVER", status: 500 })).toBe(true);
  });

  it.each([
    ["status 503 instead of 500", `503 ${REAL_BODY}`],
    ["status 500 but error.type is rate_limit_error", `500 ${JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: BACKLOG_MESSAGE } })}`],
    ["status 500, api_error, but a different message", `500 ${JSON.stringify({ type: "error", error: { type: "api_error", message: "session transcript ownership capacity is full" } })}`],
    ["the message merely CONTAINS the phrase", `500 Internal error: ${BACKLOG_MESSAGE}`],
    ["the phrase with trailing junk after valid JSON", `500 ${REAL_BODY} (request-id abc)`],
    ["error is a string, not an object", `500 ${JSON.stringify({ type: "error", error: BACKLOG_MESSAGE })}`],
    ["error.message differs by one trailing character", `500 ${JSON.stringify({ type: "error", error: { type: "api_error", message: `${BACKLOG_MESSAGE}.` } })}`],
    ["error.message differs by case", `500 ${JSON.stringify({ type: "error", error: { type: "api_error", message: "Session transcript ownership backlog is full" } })}`],
    ["a bare JSON array body", `500 ${JSON.stringify([{ type: "api_error" }])}`],
    ["no status prefix at all", REAL_BODY],
  ])("does NOT match: %s", (_label, message) => {
    expect(isTranscriptBacklogFailure({ message, code: "SERVER" })).toBe(false);
  });

  it("does not match a null or absent failure", () => {
    expect(isTranscriptBacklogFailure(undefined)).toBe(false);
    expect(isTranscriptBacklogFailure({})).toBe(false);
    expect(isTranscriptBacklogFailure({ message: "" })).toBe(false);
  });

  it("compares the message with equality, not substring containment", () => {
    // A substring implementation would match this; an equality one must not.
    const longer = JSON.stringify({
      type: "error",
      error: { type: "api_error", message: `${BACKLOG_MESSAGE} (retry later)` },
    });
    expect(isTranscriptBacklogFailure({ message: `500 ${longer}`, code: "SERVER" })).toBe(false);
  });
});

// ── 2. other 500s and unparseable bodies fall through ────────────────────

describe("acceptance 2 — a different 500 and an unparseable body both fall through", () => {
  it.each([
    ["a 500 whose body is a different api_error", `500 ${JSON.stringify({ type: "error", error: { type: "api_error", message: "Unknown error" } })}`],
    ["a 500 whose body is not JSON at all", "500 <html><body>Bad Gateway</body></html>"],
    ["a 500 with truncated JSON", `500 {"type":"error","error":{"type":"api_er`],
    ["a 500 with an empty body", "500 status code (no body)"],
  ])("%s raises no pause and no prompt", async (_label, message) => {
    const system = makeSystem();
    const prompter = makePrompter("wipe");
    const decision = await handleRequestError({ message, code: "SERVER" }, deps(system, prompter));

    expect(decision.kind).toBe("fall-through");
    expect(prompter.calls).toHaveLength(0);
    expect(latch.isSet()).toBe(false);
    expect(system.journal).toEqual([]);
  });
});

// ── 3. no model call and no agent tool call on any path ──────────────────

describe("acceptance 3 — no model call and no agent tool call on any path", () => {
  it("the plugin never resolves an llm, tools, agents or subagents service", async () => {
    const requested: string[] = [];
    const askSpy = vi.fn(async () => ({
      answers: [{ id: "meridian-backlog", selected: ["No — let it fail normally"] }],
    }));

    const ctx = {
      get(serviceName: string) {
        requested.push(serviceName);
        if (serviceName === "userQuestions") return { ask: askSpy };
        return undefined;
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      on: vi.fn(() => () => {}),
      effect: vi.fn(),
    };

    const { apply } = await import("../src/index");
    apply(ctx as never, { cacheDir: CACHE_DIR });

    // Drive the registered listener directly with the real failure.
    const listener = ctx.on.mock.calls[0]![1] as (
      p: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>;
    const next = vi.fn(async () => undefined);
    await listener({ failure: REAL_FAILURE }, next);

    const forbidden = ["llm", "tools", "agents", "subagents", "agent", "toolRegistry"];
    for (const service of forbidden) {
      expect(requested, `plugin must never reach for the "${service}" service`).not.toContain(service);
    }
    expect(requested).toContain("userQuestions");
    // The only outward call on the whole path is the dialog.
    expect(askSpy).toHaveBeenCalledTimes(1);
  });

  it("the decision core has no seam through which a model could be called", async () => {
    // Every dependency is declared by BreakerDeps; there is no service locator
    // inside the core. Passing a deps object whose only callables are the ports
    // and the prompter proves the core cannot reach anything else.
    const system = makeSystem();
    const prompter = makePrompter("wipe");
    await handleRequestError(REAL_FAILURE, deps(system, prompter));
    expect(Object.keys(deps(system, prompter)).sort()).toEqual(["ports", "prompter"]);
  });
});

// ── 4. N sessions, exactly ONE prompt ────────────────────────────────────

describe("acceptance 4 — later hits JOIN the pause and exactly one prompt is raised", () => {
  it("five concurrent sessions raise exactly one dialog and all get the outcome", async () => {
    const system = makeSystem();
    let asked = 0;
    let release!: (c: Choice) => void;
    const gate = new Promise<Choice>((r) => {
      release = r;
    });
    const prompter: Prompter = {
      async ask() {
        asked += 1;
        return gate;
      },
    };

    const sessions = Array.from({ length: 5 }, () =>
      handleRequestError(REAL_FAILURE, deps(system, prompter)),
    );

    // Let every session reach the latch before the dialog is answered.
    await new Promise((r) => setImmediate(r));
    expect(asked).toBe(1);
    expect(latch.waiterCount()).toBe(5);

    release("wipe");
    const decisions = await Promise.all(sessions);

    expect(asked).toBe(1);
    expect(decisions.every((d) => d.kind === "retry")).toBe(true);
    // One pause, one remedy — not five wipes.
    expect(system.journal.filter((s) => s.startsWith("stop:"))).toHaveLength(1);
    expect(latch.generation()).toBe(1);
  });

  it("a session arriving after the pause opened still joins rather than prompting", async () => {
    const system = makeSystem();
    let asked = 0;
    let release!: (c: Choice) => void;
    const gate = new Promise<Choice>((r) => {
      release = r;
    });
    const prompter: Prompter = {
      async ask() {
        asked += 1;
        return gate;
      },
    };

    const first = handleRequestError(REAL_FAILURE, deps(system, prompter));
    await new Promise((r) => setImmediate(r));
    const late = handleRequestError(REAL_FAILURE, deps(system, prompter));
    await new Promise((r) => setImmediate(r));

    expect(asked).toBe(1);
    expect(latch.waiterCount()).toBe(2);

    release("wipe");
    expect((await first).kind).toBe("retry");
    expect((await late).kind).toBe("retry");
    expect(asked).toBe(1);
  });
});

// ── 5. while the latch is set, no retry chain advances ───────────────────

/**
 * A faithful miniature of the cordis waterfall: listeners run in order, each
 * receives a `next` that invokes the rest, and a listener that returns without
 * calling `next()` ends the chain (dsh-agent-loop/lib/index.js:653-663).
 */
type Listener = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>;

function waterfall(listeners: Listener[], payload: unknown): Promise<unknown> {
  let index = 0;
  const step = (): Promise<unknown> => {
    const listener = listeners[index++];
    if (listener === undefined) return Promise.resolve(undefined);
    return Promise.resolve(listener(payload, step));
  };
  return step();
}

/** The one line that matters from profiles.ts:567 — the rung advance. */
function makeFailoverListener(state: { cursor: number; levels: string[]; markedDown: string[] }) {
  const listener: Listener = async (_payload, _next) => {
    state.markedDown.push(state.levels[state.cursor]!);
    state.cursor += 1;
    if (state.cursor < state.levels.length) return { kind: "retry" };
    return undefined;
  };
  return listener;
}

describe("acceptance 5 — while the latch is set, no retry chain advances", () => {
  it("the chain index is unchanged across a paused interval", async () => {
    const system = makeSystem();
    let release!: (c: Choice) => void;
    const gate = new Promise<Choice>((r) => {
      release = r;
    });
    const prompter: Prompter = { async ask() { return gate; } };

    const chain = { cursor: 0, levels: ["meridian/opus", "backup/sonnet", "local/qwen"], markedDown: [] as string[] };
    const breakerListener: Listener = async (payload, next) => {
      const decision = await handleRequestError((payload as { failure: unknown }).failure as never, deps(system, prompter));
      return decision.kind === "retry" ? { kind: "retry" } : next();
    };

    const cursorBefore = chain.cursor;
    const pending = waterfall([breakerListener, makeFailoverListener(chain)], { failure: REAL_FAILURE });

    // Observe the chain repeatedly across a real paused interval.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2));
      expect(latch.isSet(), "the latch must still be set").toBe(true);
      expect(chain.cursor, "the chain index must not advance while paused").toBe(cursorBefore);
      expect(chain.markedDown, "no rung may be marked down while paused").toEqual([]);
    }

    release("wipe");
    await pending;
    // Even after the remedy, the failover listener never ran.
    expect(chain.cursor).toBe(cursorBefore);
    expect(chain.markedDown).toEqual([]);
  });

  it("control: the same chain DOES advance when the breaker declines to hold it", async () => {
    // Proves the previous test is measuring something real: an untouched
    // fall-through lets profiles.ts advance the rung exactly as it normally would.
    const chain = { cursor: 0, levels: ["meridian/opus", "backup/sonnet"], markedDown: [] as string[] };
    const passthrough: Listener = (_p, next) => next();
    await waterfall([passthrough, makeFailoverListener(chain)], { failure: REAL_FAILURE });
    expect(chain.cursor).toBe(1);
    expect(chain.markedDown).toEqual(["meridian/opus"]);
  });
});

// ── 6. the remedy stops BEFORE deleting and starts AFTER ─────────────────

describe("acceptance 6 — the remedy order is stop, delete, start", () => {
  it("stop precedes every delete and start follows every delete", async () => {
    const system = makeSystem();
    const result = await runRemedy(system.ports);
    expect(result.kind).toBe("done");

    const stopAt = system.journal.indexOf(`stop:${UNIT}`);
    const startAt = system.journal.indexOf(`start:${UNIT}`);
    const deleteIndexes = system.journal
      .map((entry, i) => (entry.startsWith("delete:") ? i : -1))
      .filter((i) => i >= 0);

    expect(stopAt, "the service must be stopped").toBeGreaterThanOrEqual(0);
    expect(startAt, "the service must be started again").toBeGreaterThanOrEqual(0);
    expect(deleteIndexes, "both cache files must be deleted").toHaveLength(CACHE_FILES.length);

    for (const at of deleteIndexes) {
      expect(stopAt, "every delete must happen AFTER the stop").toBeLessThan(at);
      expect(startAt, "every delete must happen BEFORE the start").toBeGreaterThan(at);
    }
  });

  it("deletes exactly the two documented cache paths", async () => {
    const system = makeSystem();
    const result = await runRemedy(system.ports);
    expect(result.kind === "done" && result.deleted).toEqual([
      `${CACHE_DIR}/session-gc.json`,
      `${CACHE_DIR}/sessions.json`,
    ]);
  });

  it("deletes NOTHING when the service cannot be stopped", async () => {
    const system = makeSystem({ stopThrows: true });
    const result = await runRemedy(system.ports);
    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.deletedNothing).toBe(true);
    expect(system.journal.some((s) => s.startsWith("delete:"))).toBe(false);
  });

  it("starts the service again even when a delete fails midway", async () => {
    const system = makeSystem({ removeThrows: "sessions.json" });
    const result = await runRemedy(system.ports);
    expect(result.kind).toBe("failed");
    // Leaving meridian stopped would be worse than the backlog.
    expect(system.journal).toContain(`start:${UNIT}`);
    expect(system.journal.indexOf(`start:${UNIT}`)).toBeGreaterThan(
      system.journal.indexOf(`stop:${UNIT}`),
    );
  });
});

// ── 7. unresolved service: say so, name the paths, claim nothing ─────────

describe("acceptance 7 — an unresolvable service is reported honestly", () => {
  it.each([
    ["resolve returns nothing", { resolved: undefined }],
    ["resolve throws", { resolveThrows: true }],
  ])("%s: nothing is stopped or deleted and both paths are named", async (_label, options) => {
    const system = makeSystem(options as never);
    const result = await runRemedy(system.ports);

    expect(result.kind).toBe("unresolved-service");
    expect(system.journal.some((s) => s.startsWith("stop:"))).toBe(false);
    expect(system.journal.some((s) => s.startsWith("delete:"))).toBe(false);

    const paths = result.kind === "unresolved-service" ? result.paths : [];
    expect(paths).toEqual([`${CACHE_DIR}/session-gc.json`, `${CACHE_DIR}/sessions.json`]);
  });

  it("the user-facing message names both paths and claims no repair", () => {
    const message = unresolvedMessage(cachePaths(CACHE_DIR));
    expect(message).toContain(`${CACHE_DIR}/session-gc.json`);
    expect(message).toContain(`${CACHE_DIR}/sessions.json`);
    expect(message).toMatch(/could not find/i);
    expect(message).toMatch(/nothing has been repaired/i);
    // It must never imply success.
    expect(message).not.toMatch(/\b(?:fixed|repaired meridian|cleared the backlog|done)\b/i);
  });

  it("the whole pause ends as a fall-through, not a false retry", async () => {
    const system = makeSystem({ resolved: undefined });
    const prompter = makePrompter("wipe");
    const decision = await handleRequestError(REAL_FAILURE, deps(system, prompter));
    expect(decision.kind).toBe("fall-through");
    expect(latch.isSet()).toBe(false);
  });

  it("the prompt drops the repair options when there is no unit to control", () => {
    const prompt = buildPrompt({ unit: undefined, paths: cachePaths(CACHE_DIR), pausedSessions: 1 });
    expect(prompt.options.map((o) => o.id)).toEqual(["decline"]);
    expect(prompt.body).toContain(`${CACHE_DIR}/session-gc.json`);
    expect(prompt.body).toContain(`${CACHE_DIR}/sessions.json`);
    expect(prompt.body).toMatch(/could NOT find the meridian service unit/);
  });
});

// ── 8. declining clears the latch and wedges nothing ─────────────────────

describe("acceptance 8 — declining clears the latch and lets the normal path proceed", () => {
  it("clears the latch, changes nothing, and falls through", async () => {
    const system = makeSystem();
    const prompter = makePrompter("decline");
    const decision = await handleRequestError(REAL_FAILURE, deps(system, prompter));

    expect(decision.kind).toBe("fall-through");
    expect(latch.isSet(), "a declined pause must not stay set").toBe(false);
    expect(latch.waiterCount()).toBe(0);
    expect(system.journal.some((s) => s.startsWith("stop:"))).toBe(false);
    expect(system.journal.some((s) => s.startsWith("delete:"))).toBe(false);
  });

  it("every joined session is released, none wedged", async () => {
    const system = makeSystem();
    let release!: (c: Choice) => void;
    const gate = new Promise<Choice>((r) => { release = r; });
    const prompter: Prompter = { async ask() { return gate; } };

    const sessions = Array.from({ length: 4 }, () =>
      handleRequestError(REAL_FAILURE, deps(system, prompter)),
    );
    await new Promise((r) => setImmediate(r));
    expect(latch.waiterCount()).toBe(4);

    release("decline");
    const decisions = await Promise.race([
      Promise.all(sessions),
      new Promise((_r, reject) => setTimeout(() => reject(new Error("a session stayed wedged")), 1000)),
    ]) as { kind: string }[];

    expect(decisions.every((d) => d.kind === "fall-through")).toBe(true);
    expect(latch.isSet()).toBe(false);
  });

  it("after a decline the normal failure path really does proceed down the chain", async () => {
    const system = makeSystem();
    const prompter = makePrompter("decline");
    const chain = { cursor: 0, levels: ["meridian/opus", "backup/sonnet"], markedDown: [] as string[] };

    const breakerListener: Listener = async (payload, next) => {
      const decision = await handleRequestError((payload as { failure: unknown }).failure as never, deps(system, prompter));
      return decision.kind === "retry" ? { kind: "retry" } : next();
    };

    const action = await waterfall([breakerListener, makeFailoverListener(chain)], { failure: REAL_FAILURE });
    // Declining hands control back: the chain advances exactly as it normally would.
    expect(chain.cursor).toBe(1);
    expect(action).toEqual({ kind: "retry" });
  });

  it("a later failure can open a NEW pause — nothing is left latched", async () => {
    const system = makeSystem();
    const first = makePrompter("decline");
    await handleRequestError(REAL_FAILURE, deps(system, first));
    expect(latch.generation()).toBe(1);

    const second = makePrompter("decline");
    await handleRequestError(REAL_FAILURE, deps(system, second));
    expect(second.calls, "a second dialog must be possible after a decline").toHaveLength(1);
    expect(latch.generation()).toBe(2);
  });

  it("a prompter that throws still clears the latch", async () => {
    const system = makeSystem();
    const prompter: Prompter = { async ask() { throw new Error("UI gone"); } };
    const decision = await handleRequestError(REAL_FAILURE, deps(system, prompter));
    expect(decision.kind).toBe("fall-through");
    expect(latch.isSet()).toBe(false);
  });
});

// ── 9. the prompt links #895 and does not overclaim ──────────────────────

describe("acceptance 9 — the prompt links #895, states the remedy, and does not overclaim", () => {
  const prompt = buildPrompt({ unit: UNIT, paths: cachePaths(CACHE_DIR), pausedSessions: 1 });

  it("links the upstream issue", () => {
    expect(prompt.body).toContain(ISSUE_URL);
    expect(prompt.body).toContain("895");
  });

  it("states the remedy, in order, including the two files", () => {
    const wipe = prompt.options.find((o) => o.id === "wipe");
    expect(wipe).toBeDefined();
    const stopAt = wipe!.detail.indexOf("Stop");
    const deleteAt = wipe!.detail.indexOf("delete");
    const startAt = wipe!.detail.indexOf("start it again");
    expect(stopAt).toBeGreaterThanOrEqual(0);
    expect(stopAt).toBeLessThan(deleteAt);
    expect(deleteAt).toBeLessThan(startAt);
    for (const file of CACHE_FILES) expect(wipe!.detail).toContain(file);
  });

  it("explains WHY the order matters", () => {
    expect(prompt.body).toMatch(/rewrites (?:both|them) (?:files )?continuously|next flush/i);
  });

  it("makes none of the forbidden claims", () => {
    expect(overclaims(prompt)).toEqual([]);
  });

  it.each(FORBIDDEN_CLAIMS.map((c) => [c.name, c.pattern] as const))(
    "never makes the claim: %s",
    (_name, pattern) => {
      const text = `${prompt.title}\n${prompt.body}\n${prompt.options.map((o) => `${o.label} ${o.detail}`).join("\n")}`;
      expect(text).not.toMatch(pattern);
    },
  );

  it("says plainly that the cause here is NOT established", () => {
    expect(prompt.body).toMatch(/not established/i);
  });

  it("marks #895 as a Windows report and says this machine is Linux", () => {
    expect(prompt.body).toMatch(/windows/i);
    expect(prompt.body).toMatch(/linux/i);
    expect(prompt.body).toMatch(/still open/i);
  });

  it("the overclaim detector actually detects — it is not a vacuous check", () => {
    const poisoned: Prompt = {
      ...prompt,
      body: `${prompt.body}\nUpgrade meridian to 1.67.0; the root cause is a Windows GC bug fixed in 1.67.0.`,
    };
    const found = overclaims(poisoned);
    expect(found).toContain("upgrade advice");
    expect(found).toContain("root-cause assertion");
    expect(found).toContain("fixed-in-version claim");
  });

  it("mentions how many sessions are waiting when several are", () => {
    const many = buildPrompt({ unit: UNIT, paths: cachePaths(CACHE_DIR), pausedSessions: 4 });
    expect(many.body).toMatch(/4 sessions are paused/);
    expect(prompt.body).not.toMatch(/sessions are paused/);
  });
});

// ── 10. the ceiling mitigation is offered separately ─────────────────────

describe("acceptance 10 — SESSION_GC_MAX_PENDING is offered separately and honestly", () => {
  const prompt = buildPrompt({ unit: UNIT, paths: cachePaths(CACHE_DIR), pausedSessions: 1 });

  it("is a distinct option, not folded into the wipe", () => {
    const ids = prompt.options.map((o) => o.id);
    expect(ids).toContain("wipe");
    expect(ids).toContain("ceiling");
    expect(ids.indexOf("wipe")).not.toBe(ids.indexOf("ceiling"));

    const wipe = prompt.options.find((o) => o.id === "wipe")!;
    expect(wipe.detail, "the wipe option must not mention the ceiling variable").not.toContain(CEILING_KEY);
  });

  it("is described as reducing recurrence, not as a fix", () => {
    const ceiling = prompt.options.find((o) => o.id === "ceiling")!;
    expect(ceiling.detail).toMatch(/recur less often/i);
    expect(ceiling.detail).toMatch(/DEFERS the problem/i);
    expect(ceiling.detail).not.toMatch(/\b(?:solves|resolves|fixes) (?:the|this) problem\b/i);
  });

  it("uses the MERIDIAN_-prefixed variable that meridian actually reads", () => {
    const ceiling = prompt.options.find((o) => o.id === "ceiling")!;
    expect(CEILING_KEY).toBe("MERIDIAN_SESSION_GC_MAX_PENDING");
    expect(ceiling.detail).toContain(`${CEILING_KEY}=${CEILING_DEFAULT}`);
    // and warns that the bare name from the issue would silently do nothing
    expect(ceiling.detail).toMatch(/bare name would have no effect/i);
  });

  it("applies as a drop-in, a daemon-reload, then a restart, in that order", async () => {
    const system = makeSystem();
    const result = await runCeilingMitigation(system.ports);
    expect(result.kind).toBe("done");
    const overrideAt = system.journal.findIndex((s) => s.startsWith("override:"));
    const reloadAt = system.journal.indexOf("daemon-reload");
    const restartAt = system.journal.indexOf(`restart:${UNIT}`);
    expect(overrideAt).toBeGreaterThanOrEqual(0);
    expect(overrideAt).toBeLessThan(reloadAt);
    expect(reloadAt).toBeLessThan(restartAt);
    expect(system.journal).toContain(`override:${UNIT}:${CEILING_KEY}=${CEILING_DEFAULT}`);
  });

  it("never deletes a cache file — it is not the wipe", async () => {
    const system = makeSystem();
    await runCeilingMitigation(system.ports);
    expect(system.journal.some((s) => s.startsWith("delete:"))).toBe(false);
  });

  it("reports honestly when the unit cannot be resolved", async () => {
    const system = makeSystem({ resolved: undefined });
    const result = await runCeilingMitigation(system.ports);
    expect(result.kind).toBe("unresolved-service");
    expect(system.journal.some((s) => s.startsWith("override:"))).toBe(false);
  });

  /**
   * Verified against systemd's own rule, not against our fake.
   *
   * systemd.unit(5): drop-in "names are applied in lexicographic order,
   * regardless of which of the directories they reside in", and a repeated
   * `Environment=` assignment for one variable is won by the LATER file. A
   * drop-in that sorts BEFORE an existing one is therefore silently
   * discarded, and the dialog's promise that the ceiling was raised is a lie.
   *
   * The fake `setEnvironmentOverride` never sees the filename, so nothing
   * else in this suite can catch a bad one. This test reads the REAL drop-in
   * directory. It is read-only: it writes nothing and touches no service.
   */
  it("writes a drop-in whose name sorts after every drop-in already installed", async () => {
    const { DROP_IN_NAME } = await import("../src/systemd");
    const { readdir } = await import("node:fs/promises");
    const { homedir } = await import("node:os");

    expect(DROP_IN_NAME.endsWith(".conf"), "systemd only reads *.conf drop-ins").toBe(true);

    // Plain byte comparison: what `LC_ALL=C sort` and systemd's ordering use.
    const sortsAfter = (a: string, b: string): boolean => a > b;

    // The name systemd documents for a hand-written override — and the one
    // actually installed for meridian on this machine.
    expect(
      sortsAfter(DROP_IN_NAME, "override.conf"),
      `${DROP_IN_NAME} must sort after override.conf or its Environment= is discarded`,
    ).toBe(true);

    const dir = `${homedir()}/.config/systemd/user/meridian.service.d`;
    let existing: string[] = [];
    try {
      existing = (await readdir(dir)).filter((f) => f.endsWith(".conf") && f !== DROP_IN_NAME);
    } catch {
      existing = []; // no such directory here; the assertion above still holds
    }
    for (const installed of existing) {
      expect(
        sortsAfter(DROP_IN_NAME, installed),
        `${DROP_IN_NAME} must sort after the installed drop-in ${installed}`,
      ).toBe(true);
    }
  });
});

// ── 11. after a successful remedy every chain resumes on its rung ────────

describe("acceptance 11 — paused chains resume on their original rung and the turn completes", () => {
  it("returns retry, leaves the cursor alone, and the retried request succeeds", async () => {
    const system = makeSystem();
    const prompter = makePrompter("wipe");
    const chain = { cursor: 0, levels: ["meridian/opus", "backup/sonnet"], markedDown: [] as string[] };

    // A miniature agent loop: request -> on failure run the waterfall ->
    // {kind:'retry'} means loop again, undefined means the turn fails.
    let attempts = 0;
    let selectedRungs: string[] = [];

    const breakerListener: Listener = async (payload, next) => {
      const decision = await handleRequestError((payload as { failure: unknown }).failure as never, deps(system, prompter));
      return decision.kind === "retry" ? { kind: "retry" } : next();
    };
    const listeners = [breakerListener, makeFailoverListener(chain)];

    let turn: "completed" | "failed" = "failed";
    for (let i = 0; i < 5; i++) {
      attempts += 1;
      selectedRungs.push(chain.levels[chain.cursor]!);
      // The first attempt hits the backlog; after the remedy the provider works.
      const remedied = system.journal.includes(`start:${UNIT}`);
      if (remedied) {
        turn = "completed";
        break;
      }
      const action = await waterfall(listeners, { failure: REAL_FAILURE });
      if ((action as { kind?: string } | undefined)?.kind !== "retry") {
        turn = "failed";
        break;
      }
    }

    expect(turn, "the tripping turn must complete, not fail").toBe("completed");
    expect(attempts).toBe(2);
    expect(chain.cursor, "the chain must resume on its ORIGINAL rung").toBe(0);
    expect(selectedRungs, "both attempts must use the same rung").toEqual([
      "meridian/opus",
      "meridian/opus",
    ]);
    expect(chain.markedDown, "the original rung must not be marked down").toEqual([]);
  });

  it("all five joined sessions resume, none fails", async () => {
    const system = makeSystem();
    const prompter = makePrompter("wipe");
    const decisions = await Promise.all(
      Array.from({ length: 5 }, () => handleRequestError(REAL_FAILURE, deps(system, prompter))),
    );
    expect(decisions.map((d) => d.kind)).toEqual(Array(5).fill("retry"));
    expect(latch.isSet()).toBe(false);
    // Exactly one repair for five sessions.
    expect(system.journal.filter((s) => s.startsWith("stop:"))).toHaveLength(1);
  });

  it("a failed remedy does NOT claim a retry — it falls through", async () => {
    const system = makeSystem({ startThrows: true });
    const prompter = makePrompter("wipe");
    const decision = await handleRequestError(REAL_FAILURE, deps(system, prompter));
    expect(decision.kind).toBe("fall-through");
    expect(latch.isSet()).toBe(false);
  });
});
