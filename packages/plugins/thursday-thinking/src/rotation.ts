/**
 * THE ROTATION: WHICH PHRASE COMES NEXT, AND NOTHING ELSE.
 *
 * No DOM, no `setInterval`, no clock. This module answers one question --
 * "what is the next phrase?" -- and the client half is what decides when to
 * ask. That separation is the whole reason the ordering guarantee is testable
 * in node: a test can drain three full cycles in a microsecond and assert on
 * the sequence, rather than waiting eight seconds and hoping.
 *
 * WHY NOT `Math.random()` PER TICK, which is what almost every published
 * loading-message library does: it repeats. With 22 phrases, independent
 * uniform draws give roughly a 1-in-22 chance of showing the same phrase twice
 * in a row, and by the birthday bound you expect a repeat within about six
 * draws. TH3 asks for no repeat until the set is exhausted, which is a
 * different object: a SHUFFLED QUEUE. Deal the whole set, hand it out in
 * order, and only reshuffle once it is empty. Every phrase then appears
 * exactly once per cycle, by construction rather than by luck.
 *
 * The one seam worth handling: the last phrase of one cycle and the first of
 * the next are independent draws, so they can be equal, and the user would see
 * the same line twice running. Strictly that still satisfies the criterion --
 * the set HAS been exhausted -- but it looks like the bug the criterion exists
 * to prevent, so the refill rejects that arrangement and reshuffles.
 */

/** TH3: "the rotation interval is at least 2.5 seconds". */
export const MINIMUM_INTERVAL_MS = 2500;

/** A source of randomness in [0, 1). `Math.random` in production, seeded in tests. */
export type RandomSource = () => number;

export interface RotationOptions {
  /** How long each phrase is shown. Must be at least `MINIMUM_INTERVAL_MS`. */
  readonly intervalMs: number;
  /** Injected so the tests are deterministic. Defaults to `Math.random`. */
  readonly random?: RandomSource;
}

export interface Rotation {
  /** The validated interval, in milliseconds. */
  readonly intervalMs: number;
  /** How many phrases make up one full cycle. */
  readonly size: number;
  /** The next phrase. Never repeats until every other phrase has been shown. */
  next(): string;
  /** How many phrases are left before the current cycle is exhausted. */
  remaining(): number;
}

/**
 * Fisher-Yates, in place, drawing from the injected source.
 *
 * Written out rather than reached for as a one-liner because the naive
 * `sort(() => random() - 0.5)` is not a shuffle: its distribution is skewed
 * and it depends on the engine's sort implementation, so "a different order
 * next cycle" would be true far less often than it looks.
 */
function shuffle<T>(items: T[], random: RandomSource): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = items[index] as T;
    items[index] = items[swap] as T;
    items[swap] = held;
  }
  return items;
}

/**
 * Build a rotation over a phrase set.
 *
 * Throws rather than coping when the inputs are wrong: an interval under the
 * floor and an empty phrase set are both configuration mistakes that should
 * surface at startup with a message, not degrade into a silent still line.
 */
export function createRotation(phrases: readonly string[], options: RotationOptions): Rotation {
  if (phrases.length === 0) {
    throw new Error("thursday-thinking: the rotation needs at least one phrase.");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < MINIMUM_INTERVAL_MS) {
    throw new Error(
      "thursday-thinking: the rotation interval is " +
        String(options.intervalMs) +
        "ms, under the " +
        MINIMUM_INTERVAL_MS +
        "ms floor TH3 sets.",
    );
  }

  const random: RandomSource = options.random ?? Math.random;
  const source = [...phrases];

  /** The current cycle, consumed from the end so `pop()` is the whole read. */
  let queue: string[] = [];
  let lastEmitted: string | undefined;

  function refill(): void {
    queue = shuffle([...source], random);
    // Avoid showing the same phrase twice across the cycle seam. With one
    // phrase there is nothing to avoid, and with two a single swap is enough,
    // so this loop cannot spin: any reshuffle that moves a different phrase to
    // the end of the queue ends it.
    if (source.length > 1) {
      let guard = 0;
      while (queue[queue.length - 1] === lastEmitted && guard < 100) {
        queue = shuffle(queue, random);
        guard += 1;
      }
    }
  }

  return {
    intervalMs: options.intervalMs,
    size: source.length,
    next(): string {
      if (queue.length === 0) refill();
      const phrase = queue.pop() as string;
      lastEmitted = phrase;
      return phrase;
    },
    remaining(): number {
      return queue.length;
    },
  };
}
