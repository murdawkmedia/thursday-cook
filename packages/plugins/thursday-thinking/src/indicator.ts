/**
 * THE INDICATOR'S MARKUP AND ITS ONE STYLESHEET.
 *
 * Pure string building, so the two criteria that live here -- the gradient
 * endpoints and `prefers-reduced-motion` -- are assertions over a value rather
 * than something you have to open a browser to check.
 *
 * NO COLOUR IS TYPED IN THIS FILE. Every colour is `cssVar()` from
 * `@trythursday/tokens`, which is the same mechanism thursday-skin uses; a
 * test greps the built stylesheet for a hex literal and fails on a match, so
 * the rule is enforced rather than merely intended.
 *
 * WHY THE ANIMATION IS CSS AND NOT SMIL, which is the interesting decision
 * here: `assets/thursday-logo.svg` animates its own gradient with
 * `<animateTransform>`. SMIL runs regardless of `prefers-reduced-motion` --
 * there is no media query that reaches inside it and no declarative way to
 * pause it -- so lifting the logo verbatim would have shipped an animation a
 * motion-sensitive user cannot turn off. The mark below therefore carries the
 * logo's GEOMETRY and none of its animation, and the movement is a CSS
 * `animation` that the reduced-motion block switches off.
 *
 * A NOTE ON HOW THIS FILE IS WRITTEN: every CSS and SVG string is assembled
 * from arrays of ordinary quoted strings joined with newlines, and there is
 * not one template literal in the file. thursday-fonts put its CSS in a
 * template literal, wrote a comment inside it, and a backtick in that comment
 * silently terminated the literal. Arrays of quoted strings cannot fail that
 * way, so the hazard is designed out instead of being remembered.
 */

import { cssVar } from "@trythursday/tokens";

/** Root class for the indicator; also the plugin's style-element id. */
export const INDICATOR_CLASS = "th-thinking";

/** Class on the animated mark. */
export const MARK_CLASS = "th-thinking__mark";

/** Class on the rotating phrase itself. */
export const PHRASE_CLASS = "th-thinking__phrase";

/** The gradient element's id, namespaced so it cannot collide with dsh's own defs. */
export const GRADIENT_ID = "th-thinking-chroma";

/**
 * The mark: `assets/thursday-logo.svg`'s five segments, unchanged.
 *
 * The paths are copied from the source file's `#mark` group so the small mark
 * and the full logo are the same shape. What is NOT copied: the white die-cut
 * underlay, the drop-shadow filter, the metal underlay gradient and the SMIL
 * animation. At 1em none of those are legible, and the filter would cost a
 * compositor layer for a decoration.
 *
 * The two gradient stops carry classes and no `stop-color` attribute: the
 * colour arrives from the stylesheet, which is what keeps the token the single
 * source and keeps a literal out of this string.
 */
export const MARK_SVG: string = [
  '<svg class="' + MARK_CLASS + '" viewBox="0 0 800 800" aria-hidden="true" focusable="false">',
  "  <defs>",
  '    <linearGradient id="' + GRADIENT_ID + '" gradientUnits="objectBoundingBox"',
  '                    x1="0" y1="0" x2="1" y2="1">',
  '      <stop class="' + MARK_CLASS + '-start" offset="0%"/>',
  '      <stop class="' + MARK_CLASS + '-end" offset="100%"/>',
  "    </linearGradient>",
  "  </defs>",
  '  <g fill="url(#' + GRADIENT_ID + ')">',
  '    <path d="M335 183 A33 33 0 0 1 368 150 L432 150 A33 33 0 0 1 465 183 L465 253 L335 253 Z"/>',
  '    <path d="M335 437 L465 437 L465 617 A33 33 0 0 1 432 650 L368 650 A33 33 0 0 1 335 617 Z"/>',
  '    <rect x="270" y="287" width="260" height="116"/>',
  '    <path d="M170 303 A16 16 0 0 1 186 287 L236 287 L236 403 L186 403 A16 16 0 0 1 170 387 Z"/>',
  '    <path d="M564 287 L614 287 A16 16 0 0 1 630 303 L630 387 A16 16 0 0 1 614 403 L564 403 Z"/>',
  "  </g>",
  "</svg>",
].join("\n");

/** The whole indicator: mark first, so it sits to the LEFT of the phrase. */
export function renderIndicatorMarkup(phrase: string): string {
  return [
    '<span class="' + INDICATOR_CLASS + '" role="status" aria-live="polite">',
    MARK_SVG,
    '  <span class="' + PHRASE_CLASS + '">' + escapeText(phrase) + "</span>",
    "</span>",
  ].join("\n");
}

/** Minimal text escaping. Phrases are ours, but markup assembly should not trust that. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The stylesheet.
 *
 * Three things are load-bearing and each is asserted in tests/indicator.test.ts:
 *
 *   1. the gradient's start stop is `--th-brand-blue` and its end stop is
 *      `--th-brand-orange`, both through `cssVar()`, with no literal anywhere;
 *   2. the mark is `order: 0` in a flex row and the phrase `order: 1`, so the
 *      mark is to the left independently of source order or a stray float;
 *   3. every animation and transition in the sheet is switched off inside the
 *      `prefers-reduced-motion: reduce` block -- the test extracts the set of
 *      animated selectors and requires the reduced block to name all of them,
 *      so adding a fourth animation later and forgetting the media query is a
 *      test failure rather than an accessibility regression.
 */
export function buildIndicatorStylesheet(): string {
  return [
    "/*",
    " * thursday-thinking: the working indicator.",
    " * GENERATED AT RUNTIME from @trythursday/tokens -- no colour is written here.",
    " */",
    "",
    "." + INDICATOR_CLASS + " {",
    "  display: inline-flex;",
    "  flex-direction: row;",
    "  align-items: center;",
    "  gap: 0.5em;",
    "  min-width: 0;",
    "}",
    "",
    "." + MARK_CLASS + " {",
    "  order: 0;",
    "  flex: 0 0 auto;",
    "  width: 1em;",
    "  height: 1em;",
    "  animation: th-thinking-breathe 2.4s ease-in-out infinite;",
    "  transform-origin: 50% 50%;",
    "}",
    "",
    "." + MARK_CLASS + "-start {",
    "  stop-color: " + cssVar("brand-blue") + ";",
    "}",
    "",
    "." + MARK_CLASS + "-end {",
    "  stop-color: " + cssVar("brand-orange") + ";",
    "}",
    "",
    "." + PHRASE_CLASS + " {",
    "  order: 1;",
    "  color: " + cssVar("foreground-muted") + ";",
    // The phrase must not wrap: TH3 caps the phrase at 32 characters precisely
    // so the line holds at the narrowest width, and nowrap is the half of that
    // promise the stylesheet owns.
    "  white-space: nowrap;",
    "  transition: opacity 180ms ease-in-out;",
    "}",
    "",
    "@keyframes th-thinking-breathe {",
    "  0%, 100% { opacity: 0.62; transform: scale(0.94); }",
    "  50%      { opacity: 1;    transform: scale(1); }",
    "}",
    "",
    "/*",
    " * The accessibility criterion, and the reason the mark is not SMIL.",
    " * Everything that moves above is named here, and named with `none` rather",
    " * than a slower duration: reduce means stop, not decelerate.",
    " */",
    "@media (prefers-reduced-motion: reduce) {",
    "  ." + MARK_CLASS + " {",
    "    animation: none;",
    "    opacity: 1;",
    "    transform: none;",
    "  }",
    "",
    "  ." + PHRASE_CLASS + " {",
    "    transition: none;",
    "  }",
    "}",
    "",
  ].join("\n");
}
