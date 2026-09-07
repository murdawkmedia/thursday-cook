/**
 * The surface ladder, and the ratchet on it.
 *
 * The criterion asks for a step that is COMPUTED from the tokens, STATED, and
 * RECORDED so a later change cannot flatten the panels by accident. The first
 * two are properties of the code; the third is only real if something fails
 * when the palette moves. These tests are that something, and they check the
 * ratchet by moving the palette themselves rather than by trusting the
 * assertion to be correct.
 */
import { contrastRatio, relativeLuminance, resolveValue, tokens } from "@trythursday/tokens";
import { describe, expect, it } from "vitest";

import {
  MINIMUM_LUMINANCE_STEP,
  MINIMUM_SURFACE_CONTRAST,
  SURFACE_LADDER,
  assertSurfaceLadder,
  measuredSteps,
  minimumLuminanceStep,
  minimumSurfaceContrast,
} from "../src/surfaces";

describe("the ladder is measured, not asserted", () => {
  it("reads its luminance from the token values themselves", () => {
    for (const step of measuredSteps()) {
      const expected =
        relativeLuminance(resolveValue(step.to)) - relativeLuminance(resolveValue(step.from));
      expect(step.deltaLuminance).toBeCloseTo(expected, 12);
      expect(step.ratio).toBeCloseTo(contrastRatio(tokens[step.from], tokens[step.to]), 12);
    }
  });

  it("climbs: every surface is lighter than the one it sits on", () => {
    for (const step of measuredSteps()) {
      expect(step.deltaLuminance, `${step.from} -> ${step.to}`).toBeGreaterThan(0);
    }
  });

  it("covers the whole ladder, one step per adjacent pair", () => {
    expect(measuredSteps()).toHaveLength(SURFACE_LADDER.length - 1);
  });
});

describe("the ladder clears the recorded floors", () => {
  it("passes today", () => {
    expect(() => assertSurfaceLadder()).not.toThrow();
  });

  it("has its narrowest step at background -> background-elevated", () => {
    const narrowest = measuredSteps().reduce((a, b) =>
      a.deltaLuminance <= b.deltaLuminance ? a : b,
    );
    expect(narrowest.from).toBe("background");
    expect(narrowest.to).toBe("background-elevated");
  });

  /**
   * The measured figures, pinned. Not a duplicate of the palette -- these are
   * DERIVED quantities, and pinning them is what turns "the surfaces still look
   * separated" into something a diff can show you. If the palette moves these
   * fail, which is the intended conversation.
   */
  it("measures dL 0.009262 and 1.168:1 at its narrowest", () => {
    expect(minimumLuminanceStep()).toBeCloseTo(0.009262, 6);
    expect(minimumSurfaceContrast()).toBeCloseTo(1.168, 3);
  });

  it("keeps the floors below the measured values, but not far below", () => {
    expect(minimumLuminanceStep()).toBeGreaterThanOrEqual(MINIMUM_LUMINANCE_STEP);
    expect(minimumSurfaceContrast()).toBeGreaterThanOrEqual(MINIMUM_SURFACE_CONTRAST);
    // A ratchet, not a target: a palette may not lose more than a quarter of
    // today's separation before it has to argue its case in review.
    expect(MINIMUM_LUMINANCE_STEP).toBeGreaterThan(minimumLuminanceStep() * 0.75);
  });
});

/**
 * The ratchet itself, exercised against a palette that has been flattened.
 *
 * `assertSurfaceLadder` reads the real token table, so it cannot be given a
 * fake one without mocking the tokens package. Instead this re-derives the same
 * decision from substituted values, which proves the RULE rejects a flattened
 * ladder. The test above proves the real ladder is subject to the rule.
 */
describe("a flattened palette is rejected", () => {
  const stepBetween = (lower: string, upper: string): number =>
    relativeLuminance(upper) - relativeLuminance(lower);

  it("would fail if the canvas were lifted to meet the panels", () => {
    // #1c1c1c against #202020: a plausible-looking "tidy up the greys" change.
    expect(stepBetween("#1c1c1c", "#202020")).toBeLessThan(MINIMUM_LUMINANCE_STEP);
  });

  it("would fail if two surfaces collapsed onto one value", () => {
    expect(stepBetween("#202020", "#202020")).toBe(0);
    expect(0).toBeLessThan(MINIMUM_LUMINANCE_STEP);
  });

  it("would fail if the ladder were reordered so a panel sat below the canvas", () => {
    expect(stepBetween("#202020", "#101010")).toBeLessThan(0);
  });

  it("accepts today's actual ladder, so the floor is not merely unreachable", () => {
    expect(stepBetween(tokens.background, tokens["background-elevated"])).toBeGreaterThanOrEqual(
      MINIMUM_LUMINANCE_STEP,
    );
  });
});
