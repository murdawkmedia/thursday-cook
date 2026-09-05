# packages/tokens

The semantic design token system.

One source, two emitted artifacts. Every colour and radius in Thursday is
declared exactly once, in [`src/tokens.ts`](src/tokens.ts), and rendered from
there into both forms the rest of the codebase consumes. There is no second
copy to drift.

```
src/tokens.ts  ──┬──▶  dist/tokens.css   :root { --th-background: #101010; … }
 (single source) ├──▶  dist/index.js     tokens.background === "#101010"
                 ├──▶  dist/tokens.json  for consumers with no JS runtime
                 └──▶  dist/contrast-report.txt   the measured figures
```

The stylesheet is produced by _executing_ the built object's `renderCss()`, so
the two artifacts are the same data twice rather than two files that agree by
convention. A test asserts that the committed renderer output and the emitted
file are byte-identical, and that resolving every `var()` chain in the CSS
yields exactly the typed object.

## Using it

```ts
import { tokens, cssVar } from "@thursday/tokens";

tokens.background; // "#101010"  — literal, for canvas, terminals, image output
cssVar("background"); // "var(--th-background)" — for anything with a cascade
```

```ts
import "@thursday/tokens/tokens.css"; // declares every --th-* on :root
```

Prefer `cssVar()`/`var(--th-*)` in stylesheets. Reach for the literal `tokens`
object only where no cascade exists to resolve a variable.

**No hard-coded hex may exist outside this package.** A test walks the whole
repository and fails on any hex literal in a `.ts`, `.tsx`, `.css`, `.js`,
`.mjs` or `.cjs` file outside `packages/tokens`.

## The tokens

| Token                 | Value            | Intended use                                                                            |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `background`          | `#101010`        | App canvas: the lowest surface, behind every panel and every pixel of chrome.           |
| `background-elevated` | `#202020`        | One step up: panels, sidebars, headers, menus, and popovers that sit on the canvas.     |
| `background-surface`  | `#303030`        | Two steps up: inputs, wells, code blocks, and hovered or selected rows.                 |
| `foreground`          | `#f8f8f0`        | Primary body and UI text; the default ink on any surface.                               |
| `foreground-muted`    | `#ababab`        | Secondary text: captions, timestamps, placeholders, and disabled labels.                |
| `border`              | `#4a4a4a`        | Hairline dividers and the resting outline of a control at rest.                         |
| `border-strong`       | `#808080`        | Outline of a control identified by its edge alone; clears WCAG 1.4.11 at 3:1.           |
| `brand-blue`          | `#0a5cff`        | Brand identity blue: the cool endpoint of the Thursday logo gradient.                   |
| `brand-orange`        | `#ff8400`        | Brand identity orange: the warm endpoint of the Thursday logo gradient.                 |
| `accent`              | → `brand-orange` | Primary interactive accent: active tab, primary button, current-item marker.            |
| `accent-muted`        | `#c98f4f`        | Accent at low emphasis: inactive accent text, accent hover fills, secondary rules.      |
| `success`             | `#64d441`        | Succeeded and passing states: check marks, green tests, applied diffs.                  |
| `warning`             | `#ffd945`        | Cautionary but non-blocking states: pending approvals, deprecations, soft limits.       |
| `error`               | `#f25a5a`        | Failed and blocking states: tool-call errors, rejected approvals, failed builds.        |
| `info`                | `#45a1ed`        | Neutral informational notices, inline hints, and hyperlinks.                            |
| `selection`           | `#0a5cff59`      | Text-selection and range-highlight fill; translucent so the text under it stays lit.    |
| `focus`               | `#3d8bff`        | Keyboard focus ring: the one boundary colour that must clear 3:1 on every surface.      |
| `code`                | `#56b6c2`        | Inline code spans and code-block body text, marking literal source apart from prose.    |
| `radius-control`      | `3px`            | Corner radius for controls: buttons, inputs, chips, tabs. Fixed px so they stay square. |
| `radius-container`    | `0.75rem`        | Corner radius for containers: panels, cards, dialogs, and tool-call blocks.             |

`accent` is an alias, not a copy: the stylesheet emits
`--th-accent: var(--th-brand-orange)`, so overriding the brand colour retargets
the accent, while the typed object still hands back the resolved `#ff8400`.

## Where these came from

**Fixed points**, taken rather than derived:

- `brand-blue` `#0a5cff` and `brand-orange` `#ff8400` are the two gradient
  endpoints of `assets/thursday-logo.svg`. `#9a86b4` — the colour the gradient
  blends _through_ at 50% — is deliberately not a token.
- `error` `#f25a5a` is dsh's own tool-call error colour on dark:
  `--dsw-alias-state-error-primary` → `--dsw-static-red-400` → `#f25a5a`.
- `radius-container` `0.75rem` is dsh's existing tool-call card radius.

**Derived** from the [`xyzshantaram/shcmonokai`](https://github.com/xyzshantaram/shcmonokai)
VS Code theme ("Shan's High Contrast Monokai"), with Zed's surface treatment
secondary:

| Token                          | shcmonokai source                                                                |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `foreground` `#f8f8f0`         | `editor.foreground`, verbatim                                                    |
| `foreground-muted` `#ababab`   | the `comment` token colour, verbatim                                             |
| `background-surface` `#303030` | `editor.lineHighlightBackground`, verbatim                                       |
| `warning` `#ffd945`            | the `string` token colour, verbatim                                              |
| `success` `#64d441`            | the second `entity.name.function` green, verbatim                                |
| `info` `#45a1ed`               | `entity.name.type` blue, verbatim                                                |
| `code` `#56b6c2`               | `markup.raw.inline` / `markup.raw.block` — the theme's own "this is code" colour |

## The judgement calls

**The canvas is not pure black.** shcmonokai puts the editor on `#000000`.
That is kept as a direction but not as a value: with `#000` as the canvas there
is no step left below it, halation on OLED is worse, and every elevated surface
has to be brighter than it needs to be to clear it. `#101010` keeps the
near-black character and leaves headroom. The ladder is then a uniform `0x10`
per channel, and its top step lands exactly on the theme's line highlight.

**Surface separation is stated in luminance, not contrast ratio.** Down near
black, WCAG's `+0.05` flare term dominates the ratio, and every plausible dark
step lands between 1.1:1 and 1.3:1 — the ratio cannot tell a usable step from
an invisible one. The set is held to a floor of **0.009 absolute relative
luminance** between adjacent surfaces. Measured: 0.00926 and 0.01511.

**Warning is gold, on the far side of the accent.** A warning picked "between
orange and red" lands near 15°, wedged against both neighbours. Gold at 47.7°
sits above the accent instead. It is also 14.8° and a 1.70:1 lightness step
from `#ff8c00`, dsh's sandbox-escalation outline, which is within 1.9° of the
accent orange and therefore the colour warning most needed to escape.

**Two radii, deliberately.** `radius-control` is `3px` — fixed pixels, so a
control still reads square at a larger root font size, which a `rem` radius
would not. `radius-container` is `0.75rem` — it scales with the type it wraps,
and matches the dsh card it will sit beside.

**`border` is a hairline, not an accessible boundary.** At 2.15:1 on the canvas
it clears WCAG's 3:1 for non-text contrast _nowhere_. That is intentional for a
Zed-like low-chrome look, and the cost is paid explicitly: any control whose
boundary carries meaning must use `focus` (3.98:1 on even the lightest surface),
which is tested for exactly that.

## Verification

`pnpm --filter @thursday/tokens run build` regenerates
[`dist/contrast-report.txt`](dist/contrast-report.txt) with every figure below
computed from the tokens, so the numbers cannot go stale. Highlights:

- **`foreground` on `background`: 17.83:1** (AAA needs 7:1). On the two higher
  surfaces: 15.27:1 and 12.37:1.
- `foreground-muted` clears AA on all three surfaces (8.29 / 7.10 / 5.75).
- Every status colour clears AA on the canvas: `success` 10.00, `warning`
  13.83, `error` 5.79, `info` 6.86, `accent` 7.75, `code` 8.03.
- `focus` clears 3:1 on all three surfaces (5.74 / 4.92 / 3.98).
- `selection`, composited, leaves text at 12.74 / 11.10 / 9.58:1.
- Warm hues: `error` 0.0°, `accent` 31.1°, `warning` 47.7°.

`pnpm --filter @thursday/tokens run test` asserts all of it.
