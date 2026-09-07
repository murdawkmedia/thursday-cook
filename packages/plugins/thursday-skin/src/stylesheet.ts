/**
 * ASSEMBLING THE SKIN'S ONE STYLESHEET.
 *
 * Order matters, and the order is: Thursday's tokens, then dsh's variables
 * pointed at them, then the handful of rules that need a selector.
 *
 * THE FIRST BLOCK IS NOT WRITTEN HERE. It is `renderCss()` from
 * `@trythursday/tokens`, the same function that produces `dist/tokens.css`,
 * retargeted from `:root` to the skin's scope. That is the difference between
 * a skin that stays in step with the palette and one that quietly diverges: if
 * a token's value changed and this plugin held its own copy, the copy would
 * still be here a year later. There is no copy. The plugin cannot state a
 * colour, because the only code that emits one lives in the tokens package.
 *
 * `retargetGeneratedTokens` is written to FAIL rather than to cope. If a future
 * change to `renderCss()` alters the shape it emits, the skin throws with a
 * message saying so, instead of silently shipping a stylesheet with no
 * declarations in it -- which would look like "the skin stopped working" and
 * take an afternoon to trace.
 */

import { renderCss } from "@trythursday/tokens";

import { renderBridge } from "./bridge";
import { renderRules } from "./rules";
import { SCOPE_SELECTOR } from "./scope";
import { assertSurfaceLadder, renderSurfaceLadderRecord } from "./surfaces";

/** The opening of the block `renderCss()` emits. */
const GENERATED_BLOCK_HEAD = ":root {";

/**
 * The measured minimum luminance step, published into the stylesheet so the
 * figure the running UI was built on is readable from the page itself.
 */
export const SURFACE_STEP_PROPERTY = "--th-skin-surface-step";

/**
 * Take the declarations out of the generated `:root` block.
 *
 * Returns the block's inner text only -- the caller re-wraps it in the skin's
 * scope. Throws if the generated stylesheet is not the shape this expects.
 */
export function retargetGeneratedTokens(generated: string): string {
  const head = generated.indexOf(GENERATED_BLOCK_HEAD);
  if (head === -1) {
    throw new Error(
      "thursday-skin: @trythursday/tokens no longer emits a " +
        JSON.stringify(GENERATED_BLOCK_HEAD) +
        " block. The skin retargets that block onto its own scope and cannot " +
        "guess at a new shape; update retargetGeneratedTokens in src/stylesheet.ts.",
    );
  }
  const close = generated.lastIndexOf("}");
  if (close <= head) {
    throw new Error(
      "thursday-skin: the generated token block from @trythursday/tokens is not closed.",
    );
  }
  const body = generated.slice(head + GENERATED_BLOCK_HEAD.length, close).replace(/\s+$/, "");
  if (!body.includes("--th-")) {
    throw new Error("thursday-skin: the generated token block contains no --th-* declarations.");
  }
  return body;
}

const HEADER = [
  "/*",
  " * The Thursday skin.",
  " *",
  " * GENERATED AT RUNTIME -- there is no checked-in copy of this file, and no",
  " * colour in it was typed by hand. The first block is @trythursday/tokens'",
  " * own renderCss() output, retargeted from :root onto this skin's scope; the",
  " * second points dsh's --dsw-* theme variables at those tokens; the rest is",
  " * shape, focus and elevation, which dsh has no variables for.",
  " *",
  " * Scope: " + SCOPE_SELECTOR,
  " * Specificity (0,2,2), which outranks dsh's body[data-ds-dark-theme] at",
  " * (0,1,1). See src/scope.ts for why it is not :root.",
  " */",
].join("\n");

/**
 * Build the whole stylesheet.
 *
 * `assertSurfaceLadder()` runs first, so a palette that has flattened its
 * surface ladder fails HERE -- at the moment the skin is applied, in the
 * browser console, with the offending pair named -- and not only in CI.
 */
export function buildStylesheet(): string {
  assertSurfaceLadder();

  const tokenDeclarations = retargetGeneratedTokens(renderCss());

  const scopeBlock = [
    `${SCOPE_SELECTOR} {`,
    tokenDeclarations,
    "",
    renderSurfaceLadderRecord(SURFACE_STEP_PROPERTY),
    "",
    "  /* ------------------------------------------------------------------",
    "   * dsh's own theme variables, pointed at the tokens above. This is what",
    "   * recolours every dsh component at once, including ones not yet written.",
    "   * ------------------------------------------------------------------ */",
    "",
    renderBridge(),
    "}",
  ].join("\n");

  return [HEADER, "", scopeBlock, "", renderRules(), ""].join("\n");
}
