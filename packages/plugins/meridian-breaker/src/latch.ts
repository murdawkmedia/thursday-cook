/**
 * meridian-breaker/latch — ONE process-global pause, not per-session state.
 *
 * The first session to see the backlog error sets the latch and becomes the
 * PROMPTER. Every other session that hits the same error while it is set JOINS
 * the existing pause: it awaits the same outcome promise and raises no second
 * prompt. N stuck sessions produce exactly one dialog.
 *
 * The latch lives on `globalThis` under a versioned registered symbol rather
 * than in module scope. Module scope is per-module-instance: a plugin reloaded
 * by HMR, or loaded twice under different specifiers, would otherwise get a
 * second independent latch and a second dialog. `Symbol.for` is process-wide
 * and survives both.
 *
 * The latch NEVER stays set on its own. Every terminal path — remedied,
 * declined, failed, or disposed — calls `settle`, which wakes every waiter and
 * clears the latch in the same step. A user who declines must never leave
 * sessions wedged behind a latch nobody will clear.
 */

/** How a pause ended. Every variant clears the latch. */
export type Outcome =
  /** The remedy ran to completion; the caller should retry on its ORIGINAL rung. */
  | { readonly kind: "remedied" }
  /** The user said no; the caller should proceed down the NORMAL failure path. */
  | { readonly kind: "declined" }
  /** The remedy could not run or failed; proceed down the normal failure path. */
  | { readonly kind: "failed"; readonly reason: string };

/** What a caller gets back from {@link join}. */
export interface Join {
  /** True only for the session that actually set the latch. Exactly one per pause. */
  readonly first: boolean;
  /** Resolves when the pause ends. Every joiner of one pause shares this promise. */
  readonly outcome: Promise<Outcome>;
}

interface LatchCell {
  outcome: Promise<Outcome> | undefined;
  settle: ((outcome: Outcome) => void) | undefined;
  /** Number of chains currently parked on the latch; observable for tests. */
  waiters: number;
  /** Increments once per pause. Lets tests tell two pauses apart. */
  generation: number;
}

const CELL_KEY = Symbol.for("dotfiles-ai.meridian-breaker.latch.v1");

function cell(): LatchCell {
  const holder = globalThis as unknown as Record<symbol, LatchCell | undefined>;
  let existing = holder[CELL_KEY];
  if (existing === undefined) {
    existing = { outcome: undefined, settle: undefined, waiters: 0, generation: 0 };
    holder[CELL_KEY] = existing;
  }
  return existing;
}

/** @returns true while a pause is in effect. */
export function isSet(): boolean {
  return cell().outcome !== undefined;
}

/** @returns how many chains are parked on the current pause. */
export function waiterCount(): number {
  return cell().waiters;
}

/** @returns the current pause's generation; increments once per pause. */
export function generation(): number {
  return cell().generation;
}

/**
 * Set the latch, or join the pause already in effect.
 *
 * This is atomic with respect to the event loop: it performs no `await` before
 * publishing the promise, so two synchronous callers cannot both see an unset
 * latch and both become `first`.
 *
 * @returns whether this caller set the latch, plus the shared outcome promise.
 */
export function join(): Join {
  const c = cell();
  if (c.outcome !== undefined) {
    c.waiters += 1;
    return { first: false, outcome: c.outcome };
  }
  c.generation += 1;
  c.waiters = 1;
  c.outcome = new Promise<Outcome>((resolve) => {
    c.settle = resolve;
  });
  return { first: true, outcome: c.outcome };
}

/**
 * End the current pause: wake every waiter and clear the latch in one step.
 * Calling it when no pause is in effect is a no-op, so a double-settle from a
 * racing disposal path is harmless.
 * @param outcome - how the pause ended.
 */
export function settle(outcome: Outcome): void {
  const c = cell();
  const resolve = c.settle;
  c.outcome = undefined;
  c.settle = undefined;
  c.waiters = 0;
  if (resolve !== undefined) resolve(outcome);
}

/**
 * Drop the latch for test isolation. Any parked waiter is released as `failed`
 * so a reset can never strand a pending promise.
 * @internal
 */
export function resetForTest(): void {
  const c = cell();
  if (c.outcome !== undefined) settle({ kind: "failed", reason: "latch reset" });
  c.generation = 0;
  c.waiters = 0;
}
