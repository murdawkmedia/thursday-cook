/**
 * CRITERION 4: "the rotation interval is at least 2.5 seconds and no phrase
 * repeats until the set has been exhausted."
 *
 * The second half is the part with an algorithm behind it, so it is tested by
 * draining whole cycles rather than by reading the code and agreeing with it.
 * Because `createRotation` owns no timer, a cycle costs microseconds and the
 * tests can drain thousands of them.
 */

import { describe, expect, it } from "vitest";

import { PHRASES, ROTATION } from "../src/phrases";
import { MINIMUM_INTERVAL_MS, createRotation } from "../src/rotation";

/**
 * A deterministic PRNG, so "a different order next cycle" is a fact about a
 * fixed sequence rather than something that passes 99 runs in 100.
 * mulberry32: small, well distributed enough for a shuffle, and inline so the
 * test suite gains no dependency.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const options = (seed = 1) => ({ intervalMs: ROTATION.intervalMs, random: seeded(seed) });

/** Pull exactly one full cycle. */
function cycle(rotation: { next(): string }, size: number): string[] {
  return Array.from({ length: size }, () => rotation.next());
}

describe("the interval floor", () => {
  it("accepts the shipped interval", () => {
    expect(() => createRotation(PHRASES, options())).not.toThrow();
  });

  it("rejects anything under 2.5 seconds, naming the floor", () => {
    expect(() => createRotation(PHRASES, { intervalMs: 2499 })).toThrow(/2500ms floor/);
    expect(() => createRotation(PHRASES, { intervalMs: 0 })).toThrow();
    expect(() => createRotation(PHRASES, { intervalMs: Number.NaN })).toThrow();
  });

  it("accepts exactly the floor, so the boundary is inclusive as written", () => {
    expect(() => createRotation(PHRASES, { intervalMs: MINIMUM_INTERVAL_MS })).not.toThrow();
  });

  it("refuses an empty phrase set rather than showing a blank line forever", () => {
    expect(() => createRotation([], options())).toThrow(/at least one phrase/);
  });

  it("exposes the interval it was built with", () => {
    expect(createRotation(PHRASES, options()).intervalMs).toBe(ROTATION.intervalMs);
  });
});

describe("no phrase repeats until the set is exhausted", () => {
  it("shows every phrase exactly once in a full cycle", () => {
    const rotation = createRotation(PHRASES, options());
    const first = cycle(rotation, PHRASES.length);
    expect(first).toHaveLength(PHRASES.length);
    expect(new Set(first).size).toBe(PHRASES.length);
    expect([...first].sort()).toEqual([...PHRASES].sort());
  });

  it("holds for a hundred consecutive cycles, not just the first", () => {
    const rotation = createRotation(PHRASES, options(7));
    for (let index = 0; index < 100; index += 1) {
      const drawn = cycle(rotation, PHRASES.length);
      expect(new Set(drawn).size, "cycle " + index + " repeated a phrase").toBe(PHRASES.length);
    }
  });

  it("never shows the same phrase twice running, including across the seam", () => {
    // The seam -- last of one cycle, first of the next -- is two independent
    // draws and is the one place a shuffled queue can still stutter.
    const rotation = createRotation(PHRASES, options(11));
    let previous = rotation.next();
    for (let index = 0; index < PHRASES.length * 200; index += 1) {
      const current = rotation.next();
      expect(current, "repeated immediately after itself").not.toBe(previous);
      previous = current;
    }
  });

  it("reports how much of the cycle is left", () => {
    const rotation = createRotation(PHRASES, options());
    rotation.next();
    expect(rotation.remaining()).toBe(PHRASES.length - 1);
    cycle(rotation, PHRASES.length - 1);
    expect(rotation.remaining()).toBe(0);
  });
});

describe("the next cycle is a different order", () => {
  it("does not simply replay the first cycle", () => {
    const rotation = createRotation(PHRASES, options(3));
    const first = cycle(rotation, PHRASES.length);
    const second = cycle(rotation, PHRASES.length);
    expect(second).not.toEqual(first);
    expect([...second].sort()).toEqual([...first].sort());
  });

  it("produces a distinct order on the overwhelming majority of cycles", () => {
    // With 22 phrases an identical reshuffle has probability 1/22!, so any
    // repeat here means the shuffle is not doing its job.
    const rotation = createRotation(PHRASES, options(5));
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      seen.add(cycle(rotation, PHRASES.length).join("|"));
    }
    expect(seen.size).toBe(200);
  });

  it("is driven by the injected source, so the same seed replays exactly", () => {
    const a = cycle(createRotation(PHRASES, options(42)), PHRASES.length * 3);
    const b = cycle(createRotation(PHRASES, options(42)), PHRASES.length * 3);
    expect(a).toEqual(b);
  });

  it("is a real shuffle, not a rotation of one fixed order", () => {
    // A queue that only ever rotated would put the same phrase after a given
    // phrase every time. Collect the successors of one phrase across many
    // cycles; a rotation gives one, a shuffle gives many.
    const rotation = createRotation(PHRASES, options(13));
    const target = PHRASES[0] as string;
    const successors = new Set<string>();
    let previous = rotation.next();
    for (let index = 0; index < PHRASES.length * 400; index += 1) {
      const current = rotation.next();
      if (previous === target) successors.add(current);
      previous = current;
    }
    expect(successors.size).toBeGreaterThan(5);
  });
});

describe("degenerate sets behave rather than hang", () => {
  it("handles a single phrase without spinning on the seam guard", () => {
    const rotation = createRotation(["Only this one"], options());
    expect(cycle(rotation, 5)).toEqual(Array(5).fill("Only this one"));
  });

  it("handles two phrases by alternating", () => {
    const rotation = createRotation(["A", "B"], options(9));
    const drawn = cycle(rotation, 20);
    for (let index = 1; index < drawn.length; index += 1) {
      expect(drawn[index]).not.toBe(drawn[index - 1]);
    }
  });
});
