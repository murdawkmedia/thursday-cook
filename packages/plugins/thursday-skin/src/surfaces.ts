/**
 * THE SURFACE LADDER, AND THE RATCHET THAT KEEPS IT FROM FLATTENING.
 *
 * The ticket: "adjacent panel surfaces differ by a stated minimum luminance
 * step, computed from the token values rather than hardcoded, and the step is
 * recorded so a later change cannot flatten them by accident."
 *
 * Three obligations, and they are separate things:
 *
 *   COMPUTED   `measuredSteps()` reads the token values through the tokens
 *              package's own `relativeLuminance` and derives every adjacent
 *              step. No luminance number is typed into this file.
 *
 *   STATED     the measured minimum is emitted into the stylesheet itself, as
 *              `--th-skin-surface-step`, so the figure the running UI was
 *              built on is readable in devtools rather than living in a
 *              document that can go stale.
 *
 *   RECORDED   `MINIMUM_LUMINANCE_STEP` and `MINIMUM_SURFACE_CONTRAST` are the
 *              floors. `assertSurfaceLadder()` throws when the palette drops
 *              below them, and it runs both in the tests AND on every call to
 *              build the stylesheet -- so a flattened palette fails at the
 *              point of use, not only in CI.
 *
 * WHY TWO FLOORS. A luminance delta is what the criterion names, and it is the
 * right primitive for "these two planes are not the same plane". But relative
 * luminance is not perceptually uniform, and near black a delta of 0.009 is a
 * much more visible edge than the same delta near white. So the contrast ratio
 * is recorded beside it: the ratio is the figure that stays meaningful if the
 * palette ever moves off near-black, and the delta is the figure the criterion
 * asks for. A change has to clear both.
 *
 * WHY THE FLOORS SIT SO CLOSE TO THE MEASURED VALUES. Today's minimum step is
 * background -> background-elevated: dL 0.009262, ratio 1.168:1. The floors are
 * 0.008 and 1.15, about 14% and 1.5% of headroom. That is deliberately thin,
 * because the criterion is about preventing accidental flattening and a floor
 * with generous headroom does not prevent it -- it permits it right up to the
 * floor. This is a ratchet, not a target. Anyone deliberately lowering the
 * separation must lower these constants in the same commit, which is exactly
 * the review conversation the criterion exists to force.
 */

import { contrastRatio, relativeLuminance, resolveValue } from "@trythursday/tokens";
import type { TokenName } from "@trythursday/tokens";

/**
 * The stacked planes, darkest first.
 *
 * "Adjacent" means adjacent IN THIS LIST: each entry sits directly on the one
 * before it. The canvas carries panels, panels carry inputs and wells. dsh's
 * four `--dsw-alias-bg-layer-*` slots are mapped onto these three in
 * `bridge.ts`, and the two slots that share a rung there are siblings on the
 * same plane rather than neighbours in this ladder -- they are told apart by
 * elevation, which is what the ticket asks for anyway.
 */
export const SURFACE_LADDER: readonly TokenName[] = [
  "background",
  "background-elevated",
  "background-surface",
];

/** One measured step between two adjacent surfaces. */
export interface SurfaceStep {
  /** The lower surface. */
  readonly from: TokenName;
  /** The surface that sits directly on it. */
  readonly to: TokenName;
  /** WCAG relative-luminance difference, `to` minus `from`. */
  readonly deltaLuminance: number;
  /** WCAG contrast ratio between the two, always >= 1. */
  readonly ratio: number;
}

/**
 * The recorded floor for the luminance delta between adjacent surfaces.
 * See the module comment for why it is this close to the measured value.
 */
export const MINIMUM_LUMINANCE_STEP = 0.008;

/** The recorded floor for the contrast ratio between adjacent surfaces. */
export const MINIMUM_SURFACE_CONTRAST = 1.15;

/** Measure every adjacent step in the ladder from the token values. */
export function measuredSteps(): SurfaceStep[] {
  const steps: SurfaceStep[] = [];
  for (let index = 1; index < SURFACE_LADDER.length; index += 1) {
    const from = SURFACE_LADDER[index - 1] as TokenName;
    const to = SURFACE_LADDER[index] as TokenName;
    const lower = resolveValue(from);
    const upper = resolveValue(to);
    steps.push({
      from,
      to,
      deltaLuminance: relativeLuminance(upper) - relativeLuminance(lower),
      ratio: contrastRatio(lower, upper),
    });
  }
  return steps;
}

/** The smallest adjacent luminance delta in the ladder. */
export function minimumLuminanceStep(): number {
  return Math.min(...measuredSteps().map((step) => step.deltaLuminance));
}

/** The smallest adjacent contrast ratio in the ladder. */
export function minimumSurfaceContrast(): number {
  return Math.min(...measuredSteps().map((step) => step.ratio));
}

/**
 * Throw unless the ladder still climbs, and climbs far enough.
 *
 * Three distinct failures, reported separately because they have different
 * causes: a step that runs backwards is a reordered ladder, a step at zero is
 * two tokens collapsed onto one value, and a step below the floor is a palette
 * that drifted lighter at the bottom or darker at the top.
 */
export function assertSurfaceLadder(): void {
  for (const step of measuredSteps()) {
    const where = `${step.from} -> ${step.to}`;
    if (step.deltaLuminance <= 0) {
      throw new Error(
        `thursday-skin: the surface ladder does not climb at ${where}: ` +
          `dL = ${step.deltaLuminance.toFixed(6)}. Each surface must be lighter ` +
          `than the one it sits on.`,
      );
    }
    if (step.deltaLuminance < MINIMUM_LUMINANCE_STEP) {
      throw new Error(
        `thursday-skin: adjacent surfaces ${where} differ by only ` +
          `dL = ${step.deltaLuminance.toFixed(6)}, below the recorded minimum ` +
          `of ${MINIMUM_LUMINANCE_STEP}. Panels would read as one plane. ` +
          `Widen the palette, or lower MINIMUM_LUMINANCE_STEP deliberately ` +
          `in the same change.`,
      );
    }
    if (step.ratio < MINIMUM_SURFACE_CONTRAST) {
      throw new Error(
        `thursday-skin: adjacent surfaces ${where} contrast at only ` +
          `${step.ratio.toFixed(3)}:1, below the recorded minimum of ` +
          `${MINIMUM_SURFACE_CONTRAST}:1.`,
      );
    }
  }
}

/**
 * The ladder as CSS comments plus one custom property, for the stylesheet.
 *
 * This is the "stated" half of the criterion: the number the skin was built on
 * ships inside the artifact, so reading the running page answers the question
 * without anyone having to trust a README.
 */
export function renderSurfaceLadderRecord(propertyName: string): string {
  const lines: string[] = [
    "  /*",
    "   * The surface ladder, measured from the token values at build time.",
    "   * Adjacent planes must differ by at least",
    `   *   dL    ${MINIMUM_LUMINANCE_STEP}`,
    `   *   ratio ${MINIMUM_SURFACE_CONTRAST}:1`,
    "   * enforced by assertSurfaceLadder() in src/surfaces.ts.",
    "   *",
  ];
  for (const step of measuredSteps()) {
    lines.push(
      `   *   ${step.from} -> ${step.to}: ` +
        `dL = ${step.deltaLuminance.toFixed(6)}, ${step.ratio.toFixed(3)}:1`,
    );
  }
  lines.push("   */");
  lines.push(`  ${propertyName}: ${minimumLuminanceStep().toFixed(6)};`);
  return lines.join("\n");
}
