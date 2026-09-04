/**
 * Renders the measurement report for the token set.
 *
 * The numbers that justify these colours -- contrast ratios, luminance steps,
 * hue separations -- are computed from the tokens rather than typed into a
 * document, so they cannot fall out of date. The build writes the result to
 * `dist/contrast-report.txt`; the assertions themselves live in the tests.
 */

import {
  compositeOver,
  contrastRatio,
  hue,
  hueDistance,
  isHexColor,
  relativeLuminance,
  saturation,
} from "./color";
import { TOKENS, TOKEN_NAMES, isAlias, resolveValue } from "./tokens";
import type { TokenName } from "./tokens";

/** dsh's sandbox-escalation outline: a neighbour Thursday must not collide with. */
export const DSH_ESCALATION_OUTLINE = "#ff8c00";

const pad = (value: string, width: number): string => value.padEnd(width);
const num = (value: number, places = 2): string => value.toFixed(places);

function surfaceNames(): TokenName[] {
  return ["background", "background-elevated", "background-surface"];
}

/** Build the human-readable measurement report as a single string. */
export function renderReport(): string {
  const lines: string[] = [];
  const value = (name: TokenName): string => resolveValue(name);

  lines.push("Thursday design tokens -- measurement report (generated; do not edit)");
  lines.push("");

  lines.push("TOKENS");
  lines.push(`  ${pad("token", 22)}${pad("declared", 17)}${pad("resolves to", 12)}intended use`);
  for (const name of TOKEN_NAMES) {
    const definition = TOKENS[name];
    const declared = isAlias(definition) ? `-> ${definition.aliasOf}` : definition.value;
    lines.push(
      `  ${pad(name, 22)}${pad(declared, 17)}${pad(value(name), 12)}${definition.comment}`,
    );
  }
  lines.push("");

  lines.push("SURFACE LADDER (WCAG relative luminance)");
  const surfaces = surfaceNames();
  for (const name of surfaces) {
    lines.push(
      `  ${pad(name, 22)}${pad(value(name), 10)}L = ${num(relativeLuminance(value(name)), 6)}`,
    );
  }
  for (let index = 1; index < surfaces.length; index += 1) {
    const lower = value(surfaces[index - 1]);
    const upper = value(surfaces[index]);
    lines.push(
      `  step ${pad(`${surfaces[index - 1]} -> ${surfaces[index]}`, 44)}` +
        `dL = ${num(relativeLuminance(upper) - relativeLuminance(lower), 6)}` +
        `  (ratio ${num(contrastRatio(lower, upper), 3)}:1)`,
    );
  }
  lines.push("");

  lines.push("CONTRAST ON EACH SURFACE (ratio against background / elevated / surface)");
  for (const name of TOKEN_NAMES) {
    const raw = value(name);
    if (!isHexColor(raw)) continue;
    if (surfaces.includes(name)) continue;
    const against = surfaces.map((surface) => {
      const behind = value(surface);
      const measured = raw.length === 9 ? compositeOver(raw, behind) : raw;
      return num(contrastRatio(measured, behind));
    });
    const note = raw.length === 9 ? "  (composited over each surface)" : "";
    lines.push(
      `  ${pad(name, 22)}${pad(raw, 12)}${against.map((r) => r.padStart(7)).join("")}${note}`,
    );
  }
  lines.push("");

  lines.push("HUE SEPARATION OF THE WARM COLOURS");
  const warm: [string, string][] = [
    ["error", value("error")],
    ["accent", value("accent")],
    ["accent-muted", value("accent-muted")],
    ["dsh escalation", DSH_ESCALATION_OUTLINE],
    ["warning", value("warning")],
  ];
  for (const [name, colour] of warm) {
    lines.push(
      `  ${pad(name, 22)}${pad(colour, 12)}hue = ${num(hue(colour), 1).padStart(6)} deg` +
        `   saturation = ${num(saturation(colour))}`,
    );
  }
  const pairs: [string, string, string, string][] = [
    ["error", value("error"), "accent", value("accent")],
    ["accent", value("accent"), "warning", value("warning")],
    ["error", value("error"), "warning", value("warning")],
    ["warning", value("warning"), "dsh escalation", DSH_ESCALATION_OUTLINE],
    ["accent", value("accent"), "dsh escalation", DSH_ESCALATION_OUTLINE],
  ];
  for (const [leftName, left, rightName, right] of pairs) {
    lines.push(
      `  ${pad(`${leftName} vs ${rightName}`, 40)}` +
        `d-hue = ${num(hueDistance(left, right), 1).padStart(5)} deg` +
        `   contrast = ${num(contrastRatio(left, right))}:1`,
    );
  }
  lines.push("");

  lines.push("SELECTION, COMPOSITED");
  for (const surface of surfaces) {
    const behind = value(surface);
    const blended = compositeOver(value("selection"), behind);
    lines.push(
      `  ${pad(`selection over ${surface}`, 40)}= ${pad(blended, 10)}` +
        `foreground on it = ${num(contrastRatio(value("foreground"), blended))}:1`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
