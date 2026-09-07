/**
 * THE BRIDGE: dsh's theme variables, retargeted at Thursday's tokens.
 *
 * This is the whole mechanism of the skin. dsh's UI packages never name a
 * colour; they name a `--dsw-alias-*` or `--dsw-specific-*` variable, and its
 * theme package resolves that to a `--dsw-static-*` step. Rebinding the alias
 * layer therefore recolours every dsh component at once, including components
 * that did not exist when this file was written. dsh's own theme README calls
 * this the supported extension point: "registering one means overriding
 * same-named alias variables".
 *
 * NO COLOUR IS WRITTEN HERE. Every value on the right-hand side is produced by
 * `token()` or `mix()`, which can only emit `var(--th-...)` references built by
 * the tokens package's own `cssVar()`. There is no code path in this file that
 * can put a hex digit into the output, which is a stronger guarantee than a
 * grep over the result -- the grep confirms it, it does not create it.
 *
 * WHY `color-mix` FOR SOME ENTRIES. A handful of dsh's aliases are inherently
 * translucent: hover washes that must work over whatever surface they land on,
 * modal masks, toolbar fills over screenshots. Thursday's token set has exactly
 * one translucent token (`selection`), and inventing more would be inventing
 * colour. `color-mix(in srgb, var(--th-...) N%, transparent)` derives the
 * translucent value FROM a token instead, so a palette change still propagates
 * and the percentage is an opacity, not a colour.
 */

import { cssVar } from "@trythursday/tokens";
import type { TokenName } from "@trythursday/tokens";

/** A reference to a Thursday token. The only way a colour enters this file. */
function token(name: TokenName): string {
  return cssVar(name);
}

/**
 * A token at partial opacity, or blended toward another token.
 *
 * `over` is what the remaining percentage is made of: `"transparent"` for a
 * wash that must composite over whatever is behind it, or another token when
 * the result needs to be opaque.
 */
function mix(name: TokenName, percent: number, over: TokenName | "transparent"): string {
  const backdrop = over === "transparent" ? "transparent" : cssVar(over);
  return `color-mix(in srgb, ${cssVar(name)} ${percent}%, ${backdrop})`;
}

/** One rebinding: a dsh variable, the Thursday value, and the reason. */
export interface BridgeEntry {
  /** The dsh custom property being rebound, including its leading dashes. */
  readonly property: string;
  /** The replacement value: only ever a `var()` or a `color-mix()` of them. */
  readonly value: string;
  /** Why this token and not a neighbouring one. Emitted as a CSS comment. */
  readonly why: string;
}

/** A titled group of rebindings, purely so the emitted CSS reads in order. */
export interface BridgeSection {
  readonly title: string;
  readonly entries: readonly BridgeEntry[];
}

/**
 * SURFACES.
 *
 * dsh has four background planes; Thursday has three. The mapping is not a
 * squeeze, it is a decision about what "layer 3" is for. dsh's layer-3 carries
 * menus and popovers, and a menu does not need a fourth colour step -- it needs
 * to look like it is floating above the panel, which is elevation's job and is
 * what the ticket asks for ("panels are distinguished by elevation rather than
 * by borders alone"). So layer-2 and layer-3 share the top rung of the colour
 * ladder and are separated by `--dsw-shadow-lv3` instead.
 *
 * The consequence for the luminance criterion is worth stating plainly: the
 * pairs that must clear the recorded step are the LADDER pairs
 * (background -> elevated -> surface), which `surfaces.ts` measures. layer-2
 * and layer-3 are siblings on one plane, not neighbours in the stack, so they
 * are outside that requirement by construction rather than by exception.
 */
const SURFACES: BridgeSection = {
  title: "Surfaces -- dsh's four background planes onto Thursday's three",
  entries: [
    {
      property: "--dsw-alias-bg-base",
      value: token("background"),
      why: "The app canvas, the plane every panel is cut out of.",
    },
    {
      property: "--dsw-alias-bg-layer-1",
      value: token("background-elevated"),
      why: "Panels, sidebars and headers: one measured step above the canvas.",
    },
    {
      property: "--dsw-alias-bg-layer-2",
      value: token("background-surface"),
      why: "Wells and raised regions sitting on a panel.",
    },
    {
      property: "--dsw-alias-bg-layer-3",
      value: token("background-surface"),
      why: "Menus and popovers: same plane as layer-2, told apart by shadow-lv3.",
    },
    {
      property: "--dsw-alias-bg-module-platform",
      value: token("background-elevated"),
      why: "A module's own frame is a panel.",
    },
    {
      property: "--dsw-alias-bg-multi-select",
      value: token("background-surface"),
      why: "Selected rows are the 'hovered or selected rows' case of background-surface.",
    },
    {
      property: "--dsw-alias-bg-overlay",
      value: token("background-surface"),
      why: "Overlaid chrome reads as raised, not as canvas.",
    },
    {
      property: "--dsw-alias-bg-skeleton",
      value: mix("foreground", 6, "transparent"),
      why: "A loading placeholder is a wash over whatever surface it covers.",
    },
    {
      property: "--dsw-specific-sidebar-fill",
      value: token("background-elevated"),
      why: "The sidebar is a panel; it touches the canvas, so it must clear the step.",
    },
    {
      property: "--dsw-specific-input-major",
      value: token("background-surface"),
      why: "Inputs are named in background-surface's own definition.",
    },
    {
      property: "--dsw-specific-login-input",
      value: token("background-surface"),
      why: "Same control, different screen.",
    },
    {
      property: "--dsw-specific-selector",
      value: token("background-surface"),
      why: "A selector is an input.",
    },
    {
      property: "--dsw-specific-tip",
      value: token("background-elevated"),
      why: "Inline tips sit in the flow of a panel rather than on top of one.",
    },
    {
      property: "--dsw-specific-bubble",
      value: token("background-elevated"),
      why: "The user's message bubble is a panel on the conversation canvas.",
    },
    {
      property: "--dsw-specific-bubble-highlight",
      value: token("background-surface"),
      why: "One step further up, so a highlighted bubble separates from a plain one.",
    },
    {
      property: "--dsw-alias-tooltip-bg",
      value: token("background-surface"),
      why: "Floating chrome, lifted clear of the panel underneath.",
    },
    {
      property: "--dsw-alias-toast-bg",
      value: token("background-surface"),
      why: "Same reasoning as the tooltip.",
    },
  ],
};

/**
 * MASKS.
 *
 * Scrims behind dialogs and over media. dsh spells them as translucent blacks;
 * Thursday derives them from the canvas token so a lighter palette would lift
 * the scrim with it instead of leaving a black hole in a grey UI.
 */
const MASKS: BridgeSection = {
  title: "Masks -- scrims, derived from the canvas rather than from black",
  entries: [
    {
      property: "--dsw-alias-bg-mask-1",
      value: mix("background", 68, "transparent"),
      why: "The standard modal scrim: enough to mute the page, not enough to hide it.",
    },
    {
      property: "--dsw-alias-bg-mask-2",
      value: mix("background", 28, "transparent"),
      why: "The light scrim, used where the content behind must stay readable.",
    },
    {
      property: "--dsw-alias-bg-mask-3",
      value: mix("background", 78, "transparent"),
      why: "The heavy scrim for full-screen takeovers.",
    },
    {
      property: "--dsw-alias-bg-mask-photo",
      value: mix("background", 88, "transparent"),
      why: "Over media, where the backdrop is arbitrary and may be bright.",
    },
    {
      property: "--dsw-alias-bg-mask-drop",
      value: mix("background-elevated", 70, "transparent"),
      why: "The drop-target wash: lighter than a scrim, so the target reads as active.",
    },
  ],
};

/**
 * INK AND HAIRLINES.
 *
 * dsh has five label ranks and two Thursday tokens to spend on them, so the
 * ranks collapse in pairs: anything that is body copy becomes `foreground`,
 * anything that is supporting becomes `foreground-muted`. `label-dimmed` is
 * the one rank below both -- it is dsh's disabled/ghost ink -- and it is
 * derived rather than assigned, because the token set deliberately has no
 * fourth grey and adding one here would be inventing colour.
 */
const INK: BridgeSection = {
  title: "Ink and hairlines",
  entries: [
    {
      property: "--dsw-alias-label-primary",
      value: token("foreground"),
      why: "Body and UI text.",
    },
    {
      property: "--dsw-alias-label-primary-dimmed",
      value: token("foreground"),
      why: "Still primary rank in dsh; the dimming is done by opacity at the call site.",
    },
    {
      property: "--dsw-alias-label-primary-bluish",
      value: token("foreground"),
      why: "dsh's blue-tinted heading ink; Thursday has one primary ink and no tint.",
    },
    {
      property: "--dsw-alias-label-primary-foreground",
      value: token("background"),
      why: "Ink ON a filled accent control. Dark on accent measures 7.75:1.",
    },
    {
      property: "--dsw-alias-label-primary-inverted",
      value: token("background"),
      why: "Same inversion, used on light-filled chips.",
    },
    {
      property: "--dsw-alias-label-secondary",
      value: token("foreground-muted"),
      why: "Captions and secondary rows: 8.29:1 on the canvas, 5.75:1 on a well.",
    },
    {
      property: "--dsw-alias-label-tertiary",
      value: token("foreground-muted"),
      why: "dsh's third rank; Thursday does not spend a colour separating it from the second.",
    },
    {
      property: "--dsw-alias-label-caption",
      value: token("foreground-muted"),
      why: "Timestamps and hints, named in foreground-muted's own definition.",
    },
    {
      property: "--dsw-alias-label-dimmed",
      value: mix("foreground-muted", 55, "background-elevated"),
      why: "Disabled ink: below muted, derived from it, so it tracks a palette change.",
    },
    {
      property: "--dsw-alias-border-l1",
      value: token("border"),
      why: "Hairline dividers -- chrome that never forms the only edge of a control.",
    },
    {
      property: "--dsw-alias-border-l2",
      value: token("border"),
      why: "Same rank; dsh separates l1 and l2 by alpha, Thursday by usage.",
    },
    {
      property: "--dsw-alias-border-l2-darkmode-thin",
      value: token("border"),
      why: "dsh's dark-mode-only thin variant; identical here since the skin is dark.",
    },
    {
      property: "--dsw-alias-border-l3",
      value: token("border-strong"),
      why: "Where a border IS the control's edge, it must clear 3:1: border-strong does, at 4.82:1.",
    },
    {
      property: "--dsw-alias-border-l4",
      value: token("border-strong"),
      why: "dsh's heaviest border, same obligation.",
    },
    {
      property: "--dsw-alias-border-inverted",
      value: token("border"),
      why: "Borders on inverted fills; the hairline is correct against a light fill.",
    },
    {
      property: "--dsw-alias-border-inverted2",
      value: token("border"),
      why: "Same.",
    },
  ],
};

/**
 * BRAND, BUTTONS AND INTERACTION.
 *
 * dsh's dark theme uses near-white as its primary brand fill. Thursday's accent
 * is `brand-orange`, and the pairing that makes it work is the one dsh already
 * has: `--dsw-alias-label-primary-foreground` is the ink on a primary fill, and
 * mapping it to `background` puts near-black on orange at 7.75:1.
 *
 * The interaction washes are translucent for a reason worth keeping: they land
 * on every rung of the ladder, and a solid value that reads correctly on the
 * canvas is invisible on a well.
 */
const INTERACTION: BridgeSection = {
  title: "Brand, buttons and interaction",
  entries: [
    {
      property: "--dsw-alias-brand-primary",
      value: token("accent"),
      why: "The interactive accent. accent aliases brand-orange, so the logo drives it.",
    },
    {
      property: "--dsw-alias-brand-primary-invert",
      value: token("background"),
      why: "What sits on the brand fill.",
    },
    {
      property: "--dsw-alias-brand-text",
      value: token("accent"),
      why: "Brand-coloured text: 7.75:1 on canvas, 5.38:1 on a well.",
    },
    {
      property: "--dsw-alias-brand-primary-new-colorprimary-new-color",
      value: token("accent"),
      why: "dsh's newer brand slot, spelled exactly as dsh spells it.",
    },
    {
      property: "--dsw-alias-button-primary-hover",
      value: token("accent-muted"),
      why: "Hover steps DOWN in chroma rather than up in brightness; accent is already the top.",
    },
    {
      property: "--dsw-alias-button-primary-dimmed",
      value: token("background-surface"),
      why: "A disabled primary button loses the accent entirely and becomes a well.",
    },
    {
      property: "--dsw-alias-button-contrast-fill",
      value: token("foreground"),
      why: "The maximum-contrast fill, which on a dark skin is the ink colour.",
    },
    {
      property: "--dsw-alias-button-elevated-fill",
      value: token("background-surface"),
      why: "An elevated button is a well with a shadow.",
    },
    {
      property: "--dsw-alias-button-floating-fill",
      value: token("background-elevated"),
      why: "Floating buttons sit over content and read as panels.",
    },
    {
      property: "--dsw-alias-button-floating-hover",
      value: token("background-surface"),
      why: "Hover climbs exactly one rung, which is the measured step.",
    },
    {
      property: "--dsw-alias-button-ghost-active-fill",
      value: token("background-surface"),
      why: "An active ghost button gains a well rather than an outline.",
    },
    {
      property: "--dsw-alias-button-ghost-active-hover",
      value: mix("foreground", 12, "background-surface"),
      why: "One step past the well, derived because the ladder has no fourth rung.",
    },
    {
      property: "--dsw-alias-button-ghost-active-border",
      value: token("border-strong"),
      why: "This border is the control's edge, so it takes the 3:1 token.",
    },
    {
      property: "--dsw-alias-button-info-fill",
      value: token("info"),
      why: "Informational buttons take the informational hue, kept apart from accent.",
    },
    {
      property: "--dsw-alias-button-info-hover",
      value: mix("info", 82, "background"),
      why: "Darkened toward the canvas, so hover is a change of state, not of hue.",
    },
    {
      property: "--dsw-alias-button-tool-bar-fill",
      value: mix("background-elevated", 62, "transparent"),
      why: "Toolbar chips float over arbitrary content, so they stay translucent.",
    },
    {
      property: "--dsw-alias-button-tool-bar-fill-invisible",
      value: mix("background", 42, "transparent"),
      why: "The resting, nearly-absent state of the same chip.",
    },
    {
      property: "--dsw-alias-button-tool-bar-hover",
      value: mix("background-surface", 78, "transparent"),
      why: "Hover thickens the same wash rather than swapping its colour.",
    },
    {
      property: "--dsw-alias-interactive-bg-hover",
      value: mix("foreground", 8, "transparent"),
      why: "The generic hover wash. Translucent so it reads on every rung.",
    },
    {
      property: "--dsw-alias-interactive-bg-active",
      value: mix("foreground", 14, "transparent"),
      why: "Pressed is the same wash, heavier.",
    },
    {
      property: "--dsw-alias-interactive-bg-hover-solid",
      value: token("background-surface"),
      why: "The opaque variant, for rows that must not show what is under them.",
    },
    {
      property: "--dsw-alias-interactive-bg-hover-accent",
      value: mix("accent", 22, "transparent"),
      why: "Hover on an accented row keeps the accent hue at row weight.",
    },
    {
      property: "--dsw-alias-interactive-bg-hover-danger",
      value: mix("error", 20, "transparent"),
      why: "Destructive hover, in the error hue so it cannot be misread as accent.",
    },
    {
      property: "--dsw-specific-sidebar-nav-item-hover",
      value: mix("foreground", 8, "transparent"),
      why: "The sidebar uses the same wash as everything else.",
    },
    {
      property: "--dsw-specific-sidebar-nav-item-active",
      value: token("background-surface"),
      why: "The current session is a well, not a wash, so it survives scrolling past.",
    },
    {
      property: "--dsw-specific-sidebar-nav-item-active-accent",
      value: mix("accent", 22, "transparent"),
      why: "The accented active row, matching the generic accent hover.",
    },
  ],
};

/**
 * STATE.
 *
 * The four state hues map one to one, which is the point of having exactly four
 * mutually distinguishable ones. The `-tertiary` slots are dsh's tinted
 * backgrounds for banners; each is its own hue dropped onto the canvas so the
 * banner stays legible and the hue is still recognisable.
 */
const STATE: BridgeSection = {
  title: "State -- four hues, mapped one to one",
  entries: [
    {
      property: "--dsw-alias-state-error-primary",
      value: token("error"),
      why: "error is dsh's own tool-call error colour, so this is a no-op by design.",
    },
    { property: "--dsw-alias-state-error-secondary", value: token("error"), why: "Same hue." },
    { property: "--dsw-alias-state-success-primary", value: token("success"), why: "Passing." },
    { property: "--dsw-alias-state-success-secondary", value: token("success"), why: "Same hue." },
    {
      property: "--dsw-alias-state-success-tertiary",
      value: mix("success", 18, "background"),
      why: "Success banner fill: the hue at banner weight, over the canvas.",
    },
    { property: "--dsw-alias-state-warn-primary", value: token("warning"), why: "Cautionary." },
    { property: "--dsw-alias-state-warn-secondary", value: token("warning"), why: "Same hue." },
    {
      property: "--dsw-alias-state-warn-label",
      value: token("warning"),
      why: "Warning ink: 13.83:1 on the canvas, the brightest thing in the palette.",
    },
    {
      property: "--dsw-alias-state-warn-tertiary",
      value: mix("warning", 18, "background"),
      why: "Warning banner fill.",
    },
    {
      property: "--dsw-alias-state-business-primary",
      value: token("info"),
      why: "dsh's brand-blue informational rank becomes Thursday's info hue.",
    },
    {
      property: "--dsw-alias-state-business-tertiary",
      value: mix("info", 18, "background"),
      why: "Informational banner fill.",
    },
  ],
};

/**
 * MARKDOWN, CODE AND SYNTAX.
 *
 * The `--shiki-*` variables are the reason the transcript stops looking like
 * dsh. dsh declares them on `:root` and on `body[data-ds-dark-theme]`, both of
 * which the skin's scope outranks. The assignment follows Monokai's own
 * grammar, which is where the token set came from: keywords red, strings
 * yellow, functions green, parameters orange, types and constants cyan.
 */
const CODE: BridgeSection = {
  title: "Markdown, code and syntax",
  entries: [
    {
      property: "--dsw-alias-markdown-code-block",
      value: token("background-surface"),
      why: "Code blocks are wells, named in background-surface's own definition.",
    },
    {
      property: "--dsw-alias-markdown-code-block-banner",
      value: token("background-elevated"),
      why: "The block's header sits a rung below its body, so the body reads as inset.",
    },
    {
      property: "--dsw-alias-markdown-inline-code",
      value: token("background-surface"),
      why: "Inline code is a very small well.",
    },
    {
      property: "--dsw-alias-markdown-code-segment-selected",
      value: token("background-surface"),
      why: "Selected segment, at well weight.",
    },
    {
      property: "--dsw-alias-markdown-code-segment-unselected",
      value: token("background-elevated"),
      why: "Unselected segment, one rung down.",
    },
    {
      property: "--dsw-alias-markdown-citation",
      value: token("background-surface"),
      why: "Citation chips are wells.",
    },
    {
      property: "--dsw-alias-markdown-placeholder",
      value: token("background-surface"),
      why: "Streaming placeholder, same weight as the block it becomes.",
    },
    {
      property: "--dsw-alias-markdown-tag",
      value: token("background-surface"),
      why: "Inline tags are chips.",
    },
    {
      property: "--shiki-token-comment",
      value: token("foreground-muted"),
      why: "Comments are secondary text, which is exactly what foreground-muted is.",
    },
    {
      property: "--shiki-token-keyword",
      value: token("error"),
      why: "Monokai's keywords are its red; error is that red and never appears in prose.",
    },
    {
      property: "--shiki-token-string",
      value: token("warning"),
      why: "Monokai's strings are yellow.",
    },
    {
      property: "--shiki-token-string-expression",
      value: token("warning"),
      why: "An interpolated string is still a string.",
    },
    {
      property: "--shiki-token-function",
      value: token("success"),
      why: "Monokai's function names are green.",
    },
    {
      property: "--shiki-token-parameter",
      value: token("accent"),
      why: "Monokai's parameters are orange, which is Thursday's accent.",
    },
    {
      property: "--shiki-token-constant",
      value: token("code"),
      why: "code is the cyan the token set reserves for literal source.",
    },
    {
      property: "--shiki-token-punctuation",
      value: token("foreground-muted"),
      why: "Punctuation recedes so the identifiers carry the line.",
    },
    {
      property: "--shiki-token-link",
      value: token("info"),
      why: "Links take the informational hue everywhere, code included.",
    },
  ],
};

/**
 * SCROLLBARS.
 *
 * dsh binds `--dsh-scrollbar-thumb` on `body` to the l1 pair and rebinds it to
 * the l2 pair on elevated surfaces. Rebinding the four alias tokens moves both
 * paths at once, which is why the skin does not touch `--dsh-scrollbar-*` and
 * does not have to know which of the two rendering paths the engine took.
 */
const SCROLLBAR: BridgeSection = {
  title: "Scrollbars",
  entries: [
    {
      property: "--dsw-alias-scrollbar-bg-l1",
      value: token("border"),
      why: "A resting thumb is chrome, at hairline weight.",
    },
    {
      property: "--dsw-alias-scrollbar-hover-l1",
      value: token("border-strong"),
      why: "Hover promotes it to the 3:1 token, so grabbing it is a visible affordance.",
    },
    {
      property: "--dsw-alias-scrollbar-bg-l2",
      value: token("border"),
      why: "Same on elevated surfaces; the surface changed, the thumb's job did not.",
    },
    {
      property: "--dsw-alias-scrollbar-hover-l2",
      value: token("border-strong"),
      why: "Same.",
    },
  ],
};

/**
 * ELEVATION.
 *
 * The criterion: "panels are distinguished by elevation rather than by borders
 * alone". On a near-black canvas that is harder than it sounds, because the
 * usual instrument does not work: a black drop shadow on a near-black canvas is
 * very nearly invisible, and the measured colour step between adjacent planes
 * is real but small (1.168:1 at its narrowest).
 *
 * So each level does two things at once:
 *
 *   an ambient shadow, derived from the CANVAS token, which reads wherever the
 *   raised surface overhangs something lighter than the canvas -- which is
 *   every case that matters, because a panel is by definition lighter than what
 *   it sits on; and
 *
 *   an inset top rim, derived from the INK token at low opacity, which draws a
 *   one-pixel lit edge along the top of the raised surface. This is the cue
 *   that survives on dark: it does not depend on the backdrop at all, it says
 *   "this plane catches the light" directly. It is why a menu over a panel is
 *   legible here even though both are on the same rung of the colour ladder.
 *
 * Level 3 adds a hairline ring, so a popover has a defined edge as well as a
 * lift. Note the ordering of the criterion: elevation "rather than borders
 * ALONE" -- a border in addition to a shadow is the intent, a border instead of
 * one is not.
 */
const ELEVATION: BridgeSection = {
  title: "Elevation -- ambient shadow plus a lit rim, because black shadows do not read on black",
  entries: [
    {
      property: "--dsw-shadow-lv1",
      value: [
        `0 1px 2px 0 ${mix("background", 72, "transparent")}`,
        `inset 0 1px 0 0 ${mix("foreground", 7, "transparent")}`,
      ].join(", "),
      why: "Resting cards: barely lifted, but the rim keeps the top edge readable.",
    },
    {
      property: "--dsw-shadow-lv1-blur",
      value: `0 4px 12px 0 ${mix("background", 45, "transparent")}`,
      why: "dsh's soft companion to lv1, used where a rim would double an existing edge.",
    },
    {
      property: "--dsw-shadow-lv2",
      value: [
        `0 2px 6px 0 ${mix("background", 72, "transparent")}`,
        `0 6px 16px 0 ${mix("background", 45, "transparent")}`,
        `inset 0 1px 0 0 ${mix("foreground", 8, "transparent")}`,
      ].join(", "),
      why: "Panels and dropdowns: a two-part ambient shadow with the same lit rim.",
    },
    {
      property: "--dsw-shadow-lv3",
      value: [
        `0 0 0 1px ${cssVar("border")}`,
        `0 12px 32px 0 ${mix("background", 85, "transparent")}`,
        `inset 0 1px 0 0 ${mix("foreground", 10, "transparent")}`,
      ].join(", "),
      why: "Dialogs and popovers: the deepest lift, plus a hairline ring to define the edge.",
    },
    {
      property: "--dsw-linear-gradient-think",
      value: `linear-gradient(180deg, ${cssVar("background-elevated")} 20.19%, transparent 100%)`,
      why: "The fade over the thinking block. dsh's own 20.19% stop is kept; only colour moves.",
    },
    {
      property: "--dsw-linear-think-select",
      value: `linear-gradient(180deg, ${cssVar("background-surface")} 20.19%, transparent 100%)`,
      why: "The selected variant, one rung up, same stop.",
    },
  ],
};

/** Every rebinding the skin performs, in emission order. */
export const DSH_BRIDGE: readonly BridgeSection[] = [
  SURFACES,
  MASKS,
  INK,
  INTERACTION,
  STATE,
  CODE,
  SCROLLBAR,
  ELEVATION,
];

/** Every dsh property the skin rebinds. Used by the tests to check coverage. */
export function bridgedProperties(): string[] {
  return DSH_BRIDGE.flatMap((section) => section.entries.map((entry) => entry.property));
}

/** Every value the skin emits for a dsh property. Used by the tests. */
export function bridgedValues(): string[] {
  return DSH_BRIDGE.flatMap((section) => section.entries.map((entry) => entry.value));
}

/**
 * Render the rebindings as declarations, indented for the scope block.
 * Each carries its reason as a comment, because a mapping without a reason is
 * the thing that gets "simplified" a year later.
 */
export function renderBridge(): string {
  const blocks: string[] = [];
  for (const section of DSH_BRIDGE) {
    const lines: string[] = [`  /* ${section.title} */`];
    for (const entry of section.entries) {
      lines.push(`  /* ${entry.why} */`);
      lines.push(`  ${entry.property}: ${entry.value};`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
