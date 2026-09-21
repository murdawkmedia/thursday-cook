/**
 * The tour panel's stylesheet, generated from @trythursday/tokens.
 *
 * NO COLOUR IS TYPED IN THIS FILE: every colour, radius and the focus ring
 * arrives through `cssVar()`, the same mechanism thursday-skin and
 * thursday-thinking use. A test greps the built sheet for hex literals and
 * fails on a match.
 *
 * FOCUS IS VISIBLE (a brief requirement, not a nicety): every button
 * carries a `:focus-visible` ring from `--th-focus`, the one boundary
 * colour that clears 3:1 on every surface. The entry opts into pointer
 * events on its own root only -- `shell.overlay` is click-through until an
 * entry opts in, and the backdrop must intercept while the hole must not,
 * which the four uncovered panels get for free by simply not existing.
 *
 * Like thursday-mark, strings are arrays of quoted lines joined with
 * newlines: no template literals, so a backtick in a comment cannot
 * terminate the literal it sits in.
 */

import { cssVar } from "@trythursday/tokens";

/** Value of the style element's `data-plugin-css` attribute. */
export const STYLE_ID = "thursday-tour";

/** Root class of the overlay entry. */
export const TOUR_CLASS = "th-tour";

export function buildTourStylesheet(): string {
  return [
    "/*",
    " * thursday-tour: the tutorial panel and its four-rectangle spotlight.",
    " * GENERATED AT RUNTIME from @trythursday/tokens -- no colour is written here.",
    " */",
    "",
    "." + TOUR_CLASS + " {",
    "  pointer-events: auto;",
    "}",
    "",
    "." + TOUR_CLASS + "__hole {",
    "  position: fixed;",
    "  background: " + cssVar("background") + ";",
    "  opacity: 0.72;",
    "  pointer-events: auto;",
    "}",
    "",
    "." + TOUR_CLASS + "__card {",
    "  position: fixed;",
    "  width: 340px;",
    "  max-height: 70vh;",
    "  overflow-y: auto;",
    "  background: " + cssVar("background-elevated") + ";",
    "  color: " + cssVar("foreground") + ";",
    "  border: 1px solid " + cssVar("border-strong") + ";",
    "  border-radius: " + cssVar("radius-container") + ";",
    "  padding: 16px;",
    "  font-size: 14px;",
    "  line-height: 1.5;",
    "}",
    "",
    "." + TOUR_CLASS + "__meta {",
    "  color: " + cssVar("foreground-muted") + ";",
    "  font-size: 12px;",
    "  margin-bottom: 8px;",
    "}",
    "",
    "." + TOUR_CLASS + "__text {",
    "  margin: 0 0 12px 0;",
    "  white-space: pre-wrap;",
    "}",
    "",
    "." + TOUR_CLASS + "__waiting {",
    "  color: " + cssVar("foreground-muted") + ";",
    "  font-size: 12px;",
    "  margin: 0 0 12px 0;",
    "}",
    "",
    "." + TOUR_CLASS + "__prefill {",
    "  color: " + cssVar("foreground-muted") + ";",
    "  font-size: 12px;",
    "  margin: 0 0 12px 0;",
    "}",
    "",
    "." + TOUR_CLASS + "__actions {",
    "  display: flex;",
    "  gap: 8px;",
    "  flex-wrap: wrap;",
    "}",
    "",
    "." + TOUR_CLASS + "__btn {",
    "  border: 1px solid " + cssVar("border-strong") + ";",
    "  border-radius: " + cssVar("radius-control") + ";",
    "  background: transparent;",
    "  color: " + cssVar("foreground") + ";",
    "  padding: 6px 12px;",
    "  font-size: 13px;",
    "  cursor: pointer;",
    "}",
    "",
    "." + TOUR_CLASS + "__btn--primary {",
    "  background: " + cssVar("accent") + ";",
    "  border-color: " + cssVar("accent") + ";",
    "  color: " + cssVar("background") + ";",
    "}",
    "",
    "." + TOUR_CLASS + "__btn:focus-visible {",
    "  outline: 2px solid " + cssVar("focus") + ";",
    "  outline-offset: 2px;",
    "}",
    "",
    "." + TOUR_CLASS + "__missing {",
    "  border-color: " + cssVar("error") + ";",
    "}",
    "",
  ].join("\n");
}
