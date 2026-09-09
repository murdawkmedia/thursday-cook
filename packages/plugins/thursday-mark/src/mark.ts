/**
 * THE MARK'S GEOMETRY AND ITS ONE STYLESHEET.
 *
 * Pure string building, so the three criteria that live here -- the gradient
 * endpoints, the 14-second drift, and `prefers-reduced-motion` -- are
 * assertions over a value rather than something you have to open a browser
 * to check.
 *
 * NO COLOUR IS TYPED IN THIS FILE. Every colour is `cssVar()` from
 * `@trythursday/tokens`, the same mechanism thursday-skin and
 * thursday-thinking use; a test greps the built stylesheet AND the markup for
 * a hex literal and fails on a match, so the rule is enforced rather than
 * merely intended. (`assets/` holds the brand mark with its own colours by
 * ticket exemption; this plugin is not that exemption.)
 *
 * WHY THE ANIMATION IS CSS AND NOT SMIL, which thursday-thinking established
 * and this file follows: `assets/thursday-logo.svg` animates its own gradient
 * with `<animateTransform>`. SMIL runs regardless of `prefers-reduced-motion`
 * -- there is no media query that reaches inside it and no declarative way to
 * pause it -- so lifting the logo verbatim would have shipped an animation a
 * motion-sensitive user cannot turn off. The mark below therefore carries the
 * logo's GEOMETRY and none of its animation, and the drift is a CSS
 * `animation` on the two stops' opacity that the reduced-motion block
 * switches off. The loop is 14 seconds each way, the way the source's
 * `dur="14s"` values `A;B;A` round-trips in 28.
 *
 * A NOTE ON HOW THIS FILE IS WRITTEN: every CSS and SVG string is assembled
 * from arrays of ordinary quoted strings joined with newlines, and there is
 * not one template literal in the file. thursday-fonts put its CSS in a
 * template literal, wrote a comment inside it, and a backtick in that comment
 * silently terminated the literal. Arrays of quoted strings cannot fail that
 * way, so the hazard is designed out instead of being remembered.
 */

import { cssVar } from "@trythursday/tokens";

/** The plugin's name, used for the style element's markers. */
export const PLUGIN_NAME = "thursday-mark";

/** Root class for the mark; also the style element's `data-plugin-css` id. */
export const MARK_CLASS = "th-mark";

/** The gradient element's id, namespaced so it cannot collide with dsh's own defs. */
export const GRADIENT_ID = "th-mark-chroma";

/** Fallback pixel size when a slot renders the mark with no size of its own. */
export const MARK_DEFAULT_SIZE = 24;

/**
 * The mark: `assets/thursday-logo.svg`'s five segments, unchanged.
 *
 * The paths are copied from the source file's `#mark` group so the UI mark
 * and the logo are the same shape. What is NOT copied: the white die-cut
 * underlay, the drop-shadow filter, the metal underlay gradient and the SMIL
 * animation. In a sidebar-height slot none of those are legible, the filter
 * would cost a compositor layer for a decoration, and SMIL cannot honour
 * reduced motion (see the module comment).
 *
 * The two gradient stops carry classes and no `stop-color` attribute: the
 * colour arrives from the stylesheet, which is what keeps the token the
 * single source and keeps a literal out of this string.
 */
export const MARK_SVG: string = [
  '<svg class="' + MARK_CLASS + '__svg" viewBox="0 0 800 800" aria-hidden="true" focusable="false">',
  "  <defs>",
  '    <linearGradient id="' + GRADIENT_ID + '" gradientUnits="objectBoundingBox"',
  '                    x1="0" y1="0" x2="1" y2="1">',
  '      <stop class="' + MARK_CLASS + '__start" offset="0%"/>',
  '      <stop class="' + MARK_CLASS + '__end" offset="100%"/>',
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

/**
 * The stylesheet.
 *
 * Three things are load-bearing and each is asserted in tests/mark.test.ts:
 *
 *   1. the gradient's start stop is `--th-brand-blue` and its end stop is
 *      `--th-brand-orange`, both through `cssVar()`, with no literal
 *      anywhere -- in the stylesheet or the markup;
 *   2. the drift is a 14-second loop between the blue and orange endpoints,
 *      and the keyframes say so in seconds, not in a comment;
 *   3. every animation in the sheet is switched off inside the
 *      `prefers-reduced-motion: reduce` block, which then pins both stops at
 *      full opacity -- the static frame is the full blue-to-orange ramp, the
 *      source's centred state. The test extracts the set of animated
 *      selectors and requires the reduced block to name all of them, so
 *      adding a third animation later and forgetting the media query is a
 *      test failure rather than an accessibility regression.
 */
export function buildMarkStylesheet(): string {
  return [
    "/*",
    " * thursday-mark: the Thursday mark in dsh's brand slots.",
    " * GENERATED AT RUNTIME from @trythursday/tokens -- no colour is written here.",
    " */",
    "",
    "." + MARK_CLASS + " {",
    "  display: inline-flex;",
    "  flex: 0 0 auto;",
    "  align-items: center;",
    "  justify-content: center;",
    "}",
    "",
    "." + MARK_CLASS + "__svg {",
    "  display: block;",
    "  width: 100%;",
    "  height: 100%;",
    "}",
    "",
    "." + MARK_CLASS + "__start {",
    "  stop-color: " + cssVar("brand-blue") + ";",
    "  stop-opacity: 1;",
    "  animation: th-mark-to-orange 14s ease-in-out infinite alternate;",
    "}",
    "",
    "." + MARK_CLASS + "__end {",
    "  stop-color: " + cssVar("brand-orange") + ";",
    "  stop-opacity: 0.15;",
    "  animation: th-mark-to-blue 14s ease-in-out infinite alternate;",
    "}",
    "",
    "@keyframes th-mark-to-orange {",
    "  from { stop-opacity: 1; }",
    "  to   { stop-opacity: 0.15; }",
    "}",
    "",
    "@keyframes th-mark-to-blue {",
    "  from { stop-opacity: 0.15; }",
    "  to   { stop-opacity: 1; }",
    "}",
    "",
    "/*",
    " * The accessibility criterion, and the reason the mark is not SMIL.",
    " * Everything that moves above is named here, and named with `none` rather",
    " * than a slower duration: reduce means stop, not decelerate. The stops",
    " * rest at full opacity, the full ramp, which is the honest static frame.",
    " */",
    "@media (prefers-reduced-motion: reduce) {",
    "  ." + MARK_CLASS + "__start {",
    "    animation: none;",
    "    stop-opacity: 1;",
    "  }",
    "",
    "  ." + MARK_CLASS + "__end {",
    "    animation: none;",
    "    stop-opacity: 1;",
    "  }",
    "}",
    "",
  ].join("\n");
}
