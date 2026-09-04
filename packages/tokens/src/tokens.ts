/**
 * THE SINGLE SOURCE OF TRUTH FOR THURSDAY'S COLOUR AND SHAPE.
 *
 * Nothing else in this repository may contain a hard-coded colour. Both
 * emitted artifacts -- `dist/tokens.css` (CSS custom properties) and the
 * `tokens` object exported from `index.ts` -- are derived from the map below,
 * so the two can never drift: there is one table, and two renderings of it.
 *
 * DERIVATION
 *
 * Primary reference: the `xyzshantaram/shcmonokai` VS Code theme ("Shan's High
 * Contrast Monokai", type: dark), fetched from GitHub. Its editor foreground,
 * line-highlight, comment, string, function, type and markup-raw colours are
 * used directly or lightly adjusted; each token names what it came from.
 *
 * Secondary reference: Zed's surface treatment -- near-black canvas, very low
 * chrome, small control radii, borders that whisper rather than box things in.
 *
 * Fixed points that were not derived and must not be changed casually:
 *   - `brand-blue` #0a5cff and `brand-orange` #ff8400 are the two gradient
 *     endpoints of `assets/thursday-logo.svg`. (#9a86b4 is only the colour the
 *     gradient blends *through* at 50% and is deliberately not a token.)
 *   - `error` #f25a5a is dsh's own tool-call error colour on dark:
 *     `--dsw-alias-state-error-primary` -> `--dsw-static-red-400` -> #f25a5a.
 *   - `radius-container` 0.75rem is dsh's existing tool-call card radius.
 */

/** Loose grouping, used only to section the emitted CSS readably. */
export type TokenGroup = "surface" | "content" | "brand" | "state" | "editor" | "shape";

/**
 * Every token name. Written out by hand rather than inferred so that the map
 * below is checked against it: adding a key without adding it here, or listing
 * a name and forgetting to define it, is a type error.
 */
export type TokenName =
  | "background"
  | "background-elevated"
  | "background-surface"
  | "foreground"
  | "foreground-muted"
  | "border"
  | "border-strong"
  | "accent"
  | "accent-muted"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "selection"
  | "focus"
  | "code"
  | "brand-blue"
  | "brand-orange"
  | "radius-control"
  | "radius-container";

/** A token that owns a literal CSS value. */
export interface LiteralToken {
  /** The literal CSS value: a hex colour or a CSS length. */
  readonly value: string;
  /** One line naming what this token is for. Required for every token. */
  readonly comment: string;
  /** Which section of the emitted stylesheet this belongs to. */
  readonly group: TokenGroup;
}

/**
 * A token that is another token under a second name. The CSS artifact emits a
 * real `var()` reference so a downstream override of the target retargets the
 * alias too; the TypeScript artifact emits the resolved literal.
 */
export interface AliasToken {
  /** The token this one points at. */
  readonly aliasOf: TokenName;
  /** One line naming what this token is for. Required for every token. */
  readonly comment: string;
  /** Which section of the emitted stylesheet this belongs to. */
  readonly group: TokenGroup;
}

export type TokenDefinition = LiteralToken | AliasToken;

/** Narrowing helper: does this definition point at another token? */
export function isAlias(definition: TokenDefinition): definition is AliasToken {
  return "aliasOf" in definition;
}

/** The prefix on every emitted CSS custom property. */
export const CSS_PREFIX = "--th-";

/**
 * The token table. Insertion order is the emission order of the stylesheet.
 */
export const TOKENS = {
  // --- surfaces ------------------------------------------------------------
  // shcmonokai puts the editor on pure #000000. Pure black is kept as the
  // *direction* but not the value: with #000 as the canvas there is no step
  // left below it, halation on OLED is worse, and every elevated surface has
  // to be brighter than it needs to be. #101010 keeps the near-black character
  // and leaves headroom. The three steps are a uniform 0x10 in each channel;
  // #303030 is exactly shcmonokai's `editor.lineHighlightBackground`.
  background: {
    value: "#101010",
    comment: "App canvas: the lowest surface, behind every panel and every pixel of chrome.",
    group: "surface",
  },
  "background-elevated": {
    value: "#202020",
    comment: "One step up: panels, sidebars, headers, menus, and popovers that sit on the canvas.",
    group: "surface",
  },
  "background-surface": {
    value: "#303030",
    comment: "Two steps up: inputs, wells, code blocks, and hovered or selected rows.",
    group: "surface",
  },

  // --- content -------------------------------------------------------------
  foreground: {
    value: "#f8f8f0",
    comment: "Primary body and UI text; the default ink on any surface.",
    group: "content",
  },
  "foreground-muted": {
    value: "#ababab",
    comment: "Secondary text: captions, timestamps, placeholders, and disabled labels.",
    group: "content",
  },
  border: {
    value: "#4a4a4a",
    comment: "Hairline dividers and resting chrome that never forms the only edge of a control.",
    group: "content",
  },
  "border-strong": {
    value: "#808080",
    comment: "Outline of a control identified by its edge alone; clears WCAG 1.4.11 at 3:1.",
    group: "content",
  },

  // --- brand ---------------------------------------------------------------
  "brand-blue": {
    value: "#0a5cff",
    comment: "Brand identity blue: the cool endpoint of the Thursday logo gradient.",
    group: "brand",
  },
  "brand-orange": {
    value: "#ff8400",
    comment: "Brand identity orange: the warm endpoint of the Thursday logo gradient.",
    group: "brand",
  },
  accent: {
    aliasOf: "brand-orange",
    comment: "Primary interactive accent: active tab, primary button, current-item marker.",
    group: "brand",
  },
  "accent-muted": {
    value: "#c98f4f",
    comment: "Accent at low emphasis: inactive accent text, accent hover fills, secondary rules.",
    group: "brand",
  },

  // --- state ---------------------------------------------------------------
  success: {
    value: "#64d441",
    comment: "Succeeded and passing states: check marks, green tests, applied diffs.",
    group: "state",
  },
  warning: {
    value: "#ffd945",
    comment: "Cautionary but non-blocking states: pending approvals, deprecations, soft limits.",
    group: "state",
  },
  error: {
    value: "#f25a5a",
    comment: "Failed and blocking states: tool-call errors, rejected approvals, failed builds.",
    group: "state",
  },
  info: {
    value: "#45a1ed",
    comment: "Neutral informational notices, inline hints, and hyperlinks.",
    group: "state",
  },

  // --- editor --------------------------------------------------------------
  selection: {
    value: "#0a5cff59",
    comment: "Text-selection and range-highlight fill; translucent so the text under it stays lit.",
    group: "editor",
  },
  focus: {
    value: "#3d8bff",
    comment: "Keyboard focus ring: the one boundary colour that must clear 3:1 on every surface.",
    group: "editor",
  },
  code: {
    value: "#56b6c2",
    comment: "Inline code spans and code-block body text, marking literal source apart from prose.",
    group: "editor",
  },

  // --- shape ---------------------------------------------------------------
  "radius-control": {
    value: "3px",
    comment:
      "Corner radius for controls: buttons, inputs, chips, tabs. Fixed px so they stay square.",
    group: "shape",
  },
  "radius-container": {
    value: "0.75rem",
    comment: "Corner radius for containers: panels, cards, dialogs, and tool-call blocks.",
    group: "shape",
  },
} as const satisfies Record<TokenName, TokenDefinition>;

/** Every token name, in emission order. */
export const TOKEN_NAMES = Object.keys(TOKENS) as TokenName[];

/** The CSS custom-property name for a token, e.g. `--th-background`. */
export function cssPropertyName(name: TokenName): string {
  return `${CSS_PREFIX}${name}`;
}

/** A ready-to-paste `var(--th-...)` reference for a token. */
export function cssVar(name: TokenName): string {
  return `var(${cssPropertyName(name)})`;
}

/**
 * Follow an alias chain to the literal value behind a token. Throws on an
 * unknown target or a cycle rather than looping.
 */
export function resolveValue(name: TokenName): string {
  const seen: TokenName[] = [];
  let current: TokenName = name;
  for (;;) {
    if (seen.includes(current)) {
      throw new Error(`token alias cycle: ${[...seen, current].join(" -> ")}`);
    }
    seen.push(current);
    const definition: TokenDefinition | undefined = TOKENS[current];
    if (definition === undefined) {
      throw new Error(`unknown token: ${current}`);
    }
    if (!isAlias(definition)) return definition.value;
    current = definition.aliasOf;
  }
}
