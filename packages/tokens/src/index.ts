/**
 * `@thursday/tokens` -- the semantic design token system.
 *
 * One source (`tokens.ts`), two emitted artifacts:
 *   - `dist/tokens.css`, a `:root` block of CSS custom properties, produced by
 *     `renderCss()` at build time;
 *   - `tokens`, a frozen typed object whose keys are exactly `TokenName`.
 *
 * Both are computed from the same table on every build, so a value can only be
 * changed in one place and both artifacts move together.
 */

import {
  CSS_PREFIX,
  TOKENS,
  TOKEN_NAMES,
  cssPropertyName,
  cssVar,
  isAlias,
  resolveValue,
} from "./tokens";
import type { AliasToken, LiteralToken, TokenDefinition, TokenGroup, TokenName } from "./tokens";

export { CSS_PREFIX, TOKENS, TOKEN_NAMES, cssPropertyName, cssVar, isAlias, resolveValue };
export type { AliasToken, LiteralToken, TokenDefinition, TokenGroup, TokenName };
export * from "./color";
export { DSH_ESCALATION_OUTLINE, renderReport } from "./report";

/** The typed token object: every token name mapped to its resolved value. */
export type Tokens = { readonly [Name in TokenName]: string };

function buildTokens(): Tokens {
  const out: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    out[name] = resolveValue(name);
  }
  return Object.freeze(out) as Tokens;
}

/**
 * The token set as a plain object. Aliases are already resolved, so
 * `tokens.accent` is the literal `#ff8400` rather than a `var()` reference --
 * this is the artifact for canvas painting, image generation, terminal output
 * and anywhere else with no CSS cascade to resolve a variable.
 */
export const tokens: Tokens = buildTokens();

/**
 * The value this token contributes to the stylesheet: a literal for a normal
 * token, and a live `var()` reference for an alias so that overriding the
 * target in CSS also moves the alias.
 */
export function cssValue(name: TokenName): string {
  const definition: TokenDefinition = TOKENS[name];
  return isAlias(definition) ? cssVar(definition.aliasOf) : definition.value;
}

const GROUP_TITLES: Record<TokenGroup, string> = {
  surface: "Surfaces -- the three stacked planes everything else sits on",
  content: "Content -- ink and hairlines",
  brand: "Brand and accent -- Thursday's identity, and the interactive accent it drives",
  state: "State -- what just happened, in four mutually distinguishable hues",
  editor: "Editor and interaction -- selection, focus, and code",
  shape: "Shape -- two radii, because one cannot serve a square control and a rounded panel",
};

const GROUP_ORDER: TokenGroup[] = ["surface", "content", "brand", "state", "editor", "shape"];

/**
 * Render the stylesheet artifact. Pure: takes nothing, touches no filesystem,
 * returns the exact bytes that `dist/tokens.css` should contain. The build
 * script writes it; the tests compare against it.
 */
export function renderCss(): string {
  const lines: string[] = [
    "/*",
    " * Thursday design tokens.",
    " *",
    " * GENERATED FILE -- DO NOT EDIT.",
    " * Source of truth: packages/tokens/src/tokens.ts",
    " * Regenerate with: pnpm --filter @thursday/tokens run build",
    " */",
    "",
    ":root {",
  ];

  for (const group of GROUP_ORDER) {
    const names = TOKEN_NAMES.filter((name) => TOKENS[name].group === group);
    if (names.length === 0) continue;
    lines.push(`  /* ${GROUP_TITLES[group]} */`);
    for (const name of names) {
      lines.push(`  /* ${TOKENS[name].comment} */`);
      lines.push(`  ${cssPropertyName(name)}: ${cssValue(name)};`);
    }
    lines.push("");
  }

  // Drop the trailing blank line from the last group before closing the block.
  while (lines[lines.length - 1] === "") lines.pop();
  lines.push("}", "");
  return lines.join("\n");
}
