/**
 * THE STRUCTURAL RULES: shape, focus, and applied elevation.
 *
 * `bridge.ts` recolours dsh by rebinding variables dsh already reads. The three
 * things in this file cannot be done that way, because dsh has no variable for
 * them:
 *
 *   RADIUS      dsh has no radius token at all -- every component hard-codes
 *               its own corner in its own scoped stylesheet.
 *   FOCUS       dsh uses `:focus-visible` in about seventeen of its client
 *               packages and `outline: none` in many more. There is no single
 *               place to change.
 *   ELEVATION   dsh defines `--dsw-shadow-lv1..3` but does not apply them to
 *               every floating surface.
 *
 * So these are real rules against real selectors. Two constraints shaped them:
 *
 * SELECTORS MUST BE STRUCTURAL. dsh ships hashed CSS-module class names that
 * change on every build, so a skin written against class names would break at
 * the next dsh release and break silently. Everything here targets elements,
 * ARIA roles and standard attributes, all of which are contract rather than
 * build output.
 *
 * `!important` IS USED, DELIBERATELY, AND ONLY HERE. The bridge does not need
 * it -- rebinding a variable at higher specificity is enough. These rules do,
 * because they are overriding declarations inside component stylesheets whose
 * selectors this file cannot name or predict. It is confined to the three
 * properties above; nothing else in the skin uses it.
 */

import { cssVar } from "@trythursday/tokens";

import { ROOT_SELECTOR, SCOPE_SELECTOR, scoped, scopedList } from "./scope";

/**
 * Controls: everything a hand operates, at `radius-control` (3px).
 *
 * This is the criterion's "reads square". 3px is not zero -- the corner is
 * still cut -- but at a glance a button, a tab and an input all read as
 * rectangles, which is the Zed end of the axis and not the consumer-app end.
 *
 * THREE INPUT TYPES ARE EXEMPT and the exemption is not an ad-hoc radius: a
 * checkbox, a radio and a range thumb are drawn by the user agent, and their
 * shape carries meaning (a round radio is how you know it is a radio, not a
 * checkbox). Squaring them would destroy an affordance in the name of a shape
 * rule. They keep the UA's shape and take Thursday's colour through
 * `accent-color` instead.
 */
export const CONTROL_SELECTORS: readonly string[] = [
  "button",
  'input:not([type="radio"]):not([type="checkbox"]):not([type="range"])',
  "textarea",
  "select",
  "summary",
  "kbd",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="tooltip"]',
  '[contenteditable="true"]',
];

/**
 * Containers: the surfaces controls sit inside, at `radius-container`
 * (0.75rem).
 *
 * This is the amended criterion, and the amendment is the interesting part.
 * The ticket originally forbade any radius over 4px, which would have made this
 * list illegal; it was amended on 2026-09-07 because 0.75rem is dsh's existing
 * tool-call card radius and the approved token set records it. The intent was
 * always that the UI reads square, and `radius-control` at 3px is what
 * delivers that -- on the controls, where the eye actually reads shape.
 */
export const CONTAINER_SELECTORS: readonly string[] = [
  "dialog",
  "pre",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tabpanel"]',
];

/** Surfaces that float above the page and must read as lifted, not as boxed. */
export const ELEVATED_SELECTORS: readonly string[] = [
  "dialog",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
];

/**
 * Every interactive control that must show a keyboard focus ring.
 *
 * The bare `:focus-visible` at the head is the real guarantee -- it catches
 * anything focusable, including controls dsh has not shipped yet. The
 * enumeration after it exists so the criterion is CHECKABLE: the ticket names
 * buttons, inputs, textareas, links, tabs and chips, and a test asserts each of
 * those is present by name rather than trusting that the universal selector
 * happened to cover it.
 *
 * "Chip" is not an element or a role, so it is covered twice over: dsh's chips
 * are either `[role="button"]` or plain elements made focusable with
 * `tabindex`, and both are listed.
 */
export const FOCUS_SELECTORS: readonly string[] = [
  ":focus-visible",
  "a:focus-visible",
  "button:focus-visible",
  "input:focus-visible",
  "textarea:focus-visible",
  "select:focus-visible",
  "summary:focus-visible",
  '[role="button"]:focus-visible',
  '[role="link"]:focus-visible',
  '[role="tab"]:focus-visible',
  '[role="menuitem"]:focus-visible',
  '[role="option"]:focus-visible',
  '[role="combobox"]:focus-visible',
  '[role="checkbox"]:focus-visible',
  '[role="radio"]:focus-visible',
  '[role="switch"]:focus-visible',
  '[role="slider"]:focus-visible',
  '[contenteditable="true"]:focus-visible',
  "[tabindex]:focus-visible",
];

/**
 * THE FOCUS RING.
 *
 * The token is `focus`. Measured against the three surfaces it can land on:
 *
 *   background          5.74:1
 *   background-elevated 4.92:1
 *   background-surface  3.98:1
 *
 * All three clear WCAG 2.2 SC 1.4.11 (3:1 for non-text) with the worst case
 * still 33% above the line. That is why the token set carries a separate,
 * lightened focus blue instead of reusing `brand-blue`, which manages only
 * 2.51:1 on a well and would have failed.
 *
 * BUT CONTRAST AGAINST THE SURFACE IS NOT ENOUGH, and this is the part that is
 * easy to get wrong. A focused control is often not on a surface at all -- it
 * is a filled button. Measured against the fills the skin itself produces, the
 * same ring is a disaster:
 *
 *   focus on accent  1.35:1
 *   focus on error   1.01:1   <- invisible
 *   focus on info    1.20:1
 *
 * So the ring is drawn in two parts and never touches the control it belongs
 * to. `outline-offset` pushes the blue ring two pixels clear of the border box,
 * and the `box-shadow` fills exactly that two-pixel gap with the CANVAS token.
 * The blue therefore always has `background` on its inner edge -- 5.74:1, no
 * matter what the control is filled with -- and one of the three surfaces on
 * its outer edge, at worst 3.98:1. Both edges clear 3:1 unconditionally, which
 * is a stronger claim than "the token contrasts with the background" and is the
 * reason it survives being focused on an error-red button.
 *
 * `:focus-visible` and not `:focus`, so a mouse click paints nothing.
 */
export const FOCUS_RING_WIDTH = "2px";
export const FOCUS_RING_OFFSET = "2px";

function focusRule(): string {
  return [
    scopedList(FOCUS_SELECTORS),
    " {",
    `\n  outline: ${FOCUS_RING_WIDTH} solid ${cssVar("focus")} !important;`,
    `\n  outline-offset: ${FOCUS_RING_OFFSET} !important;`,
    `\n  box-shadow: 0 0 0 ${FOCUS_RING_OFFSET} ${cssVar("background")} !important;`,
    "\n}",
  ].join("");
}

/**
 * Focused floating surfaces keep their lift.
 *
 * The spacer ring costs a `box-shadow`, and a floating surface was already
 * using that property for its elevation -- so as first written, focusing a
 * dialog or a listbox flattened it. That is a regression introduced by the fix
 * for a different problem, and exactly the kind that ships, because nobody
 * looks at a dialog's shadow while tabbing into it.
 *
 * These selectors therefore restate both, spacer first and lift after. Each has
 * the same specificity as its entry in the rule above and is declared later, so
 * the cascade prefers this one; both are `!important`, so that comparison is
 * decided on order rather than being a fight.
 */
function elevatedFocusRule(): string {
  const selectors = ELEVATED_SELECTORS.map((selector) => `${selector}:focus-visible`);
  return [
    scopedList(selectors),
    " {",
    `\n  box-shadow: 0 0 0 ${FOCUS_RING_OFFSET} ${cssVar("background")}, var(--dsw-shadow-lv3) !important;`,
    "\n}",
  ].join("");
}

/**
 * The ONE suppression in the skin.
 *
 * A control that has focus but is not focus-visible -- the mouse-click case --
 * draws no ring. Deliberately without `!important`: the scope alone already
 * outranks a component's own `:focus` rule, and leaving the escape hatch open
 * means a component that genuinely needs a pointer-focus indicator can still
 * win with one. Any second `outline: none` appearing in this file is a bug, and
 * the tests count them.
 */
function focusSuppressionRule(): string {
  return [scoped(":focus:not(:focus-visible)"), " {", "\n  outline: none;", "\n}"].join("");
}

function radiusRule(
  selectors: readonly string[],
  radiusToken: "radius-control" | "radius-container",
): string {
  return [
    scopedList(selectors),
    " {",
    `\n  border-radius: ${cssVar(radiusToken)} !important;`,
    "\n}",
  ].join("");
}

function elevationRule(): string {
  return [
    scopedList(ELEVATED_SELECTORS),
    " {",
    "\n  box-shadow: var(--dsw-shadow-lv3);",
    "\n}",
  ].join("");
}

/**
 * The canvas, and the two things that have to be said on the scope itself.
 *
 * `accent-color` is what recolours the checkbox, radio and range thumb that the
 * radius rule deliberately leaves to the user agent -- they get Thursday's
 * accent without the skin having to redraw them.
 */
function canvasRule(): string {
  return [
    SCOPE_SELECTOR,
    " {",
    `\n  background-color: ${cssVar("background")};`,
    `\n  color: ${cssVar("foreground")};`,
    `\n  accent-color: ${cssVar("accent")};`,
    `\n  caret-color: ${cssVar("accent")};`,
    "\n}",
  ].join("");
}

function selectionRule(): string {
  return [
    scoped("::selection"),
    " {",
    `\n  background-color: ${cssVar("selection")};`,
    `\n  color: ${cssVar("foreground")};`,
    "\n}",
  ].join("");
}

/**
 * `color-scheme` has to sit on `html` for the user agent to honour it, and it
 * is what makes native widgets, form controls and the Firefox scrollbar render
 * dark even when dsh's own preference is still set to light. Tied to the same
 * attribute through `:has()`, so removing the attribute reverses it too.
 */
function colorSchemeRule(): string {
  return [ROOT_SELECTOR, " {", "\n  color-scheme: dark;", "\n}"].join("");
}

/** Every structural rule, in cascade order. */
export function renderRules(): string {
  return [
    "/* The canvas, and the accent the user agent draws its own widgets with. */",
    canvasRule(),
    "",
    "/* Text selection. */",
    selectionRule(),
    "",
    "/* Native widgets and scrollbars follow the skin, not dsh's preference. */",
    colorSchemeRule(),
    "",
    "/* Shape: controls read square at radius-control. */",
    radiusRule(CONTROL_SELECTORS, "radius-control"),
    "",
    "/* Shape: containers keep radius-container, dsh's own card radius. */",
    radiusRule(CONTAINER_SELECTORS, "radius-container"),
    "",
    "/* Elevation: floating surfaces are lifted, not merely outlined. */",
    elevationRule(),
    "",
    "/* Keyboard focus. See src/rules.ts for the two-part ring and its numbers. */",
    focusRule(),
    "",
    "/* A focused floating surface keeps its lift as well as gaining a ring. */",
    elevatedFocusRule(),
    "",
    "/* The single suppression: a mouse click paints no ring. */",
    focusSuppressionRule(),
  ].join("\n");
}
