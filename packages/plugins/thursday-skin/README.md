# @trythursday/thursday-skin

The dsh web client, in Thursday's palette. Ticket TH1.

A client-plane dsh plugin. It injects one stylesheet and sets one attribute on
`<body>`; everything else follows from those two acts.

## How it works

dsh's UI packages never name a colour. They name a `--dsw-alias-*` or
`--dsw-specific-*` variable, and `@deepseek-ai/dsh-client-ui-theme` resolves
that to a `--dsw-static-*` step. So the skin does not restyle components — it
**rebinds the variable layer**, which recolours every dsh component at once,
including components that did not exist when this was written. dsh's own theme
README names this as the supported extension point.

Three layers, in cascade order:

| Layer             | Source           | What it does                                                |
| ----------------- | ---------------- | ----------------------------------------------------------- |
| Thursday's tokens | `src/stylesheet` | `renderCss()` from `@trythursday/tokens`, retargeted        |
| The bridge        | `src/bridge`     | ~110 `--dsw-*` / `--shiki-*` variables pointed at tokens    |
| Structural rules  | `src/rules`      | radius, focus and elevation, which dsh has no variables for |

## No colour is written twice

There is no checked-in copy of the palette. The first layer is the _same
function_ that produces `packages/tokens/dist/tokens.css`, so the skin cannot
drift from the palette: there is nothing here to drift.

Everything in the bridge is emitted by two helpers that can only produce
`var(--th-...)` or a `color-mix()` of them. No code path in this package can put
a hex digit into the output.

Both halves are tested. `tests/stylesheet.test.ts` checks that no source file
contains a hex literal **and** that the set of colours in the emitted sheet is
exactly the set `renderCss()` emits — an extra one would mean the skin invented
a colour, a missing one would mean the generated block was truncated.

## Why the scope selector is not `:root`

dsh declares its theme variables on `body` and `body[data-ds-dark-theme]`, not
on `:root`. Custom properties inherit, so declaring them on `html:root` would
reach `body` only as an _inherited_ value — and an element's own declaration
beats a value it inherited, however specific the ancestor's selector was.

So the skin wins on `body` itself:

```
body                                (0,0,1)
body[data-ds-dark-theme]            (0,1,1)   <- what must be beaten
html:root body[data-thursday-skin]  (0,2,2)   <- the skin's scope
```

`src/scope.ts` carries the full derivation. `html:root` remains correct for a
plugin declaring its _own_ variables, which is what `thursday-fonts` does with
`--th-font-*`.

## The numbers

Measured from the token values, not typed in. `packages/tokens` emits the full
report to `dist/contrast-report.txt`.

**The surface ladder.** Adjacent planes must differ by a recorded minimum, and
`assertSurfaceLadder()` throws below it — in the tests _and_ on every call to
build the stylesheet, so a flattened palette fails in the browser console with
the offending pair named.

| Step                                         | ΔL       | Ratio   |
| -------------------------------------------- | -------- | ------- |
| `background` → `background-elevated`         | 0.009262 | 1.168:1 |
| `background-elevated` → `background-surface` | 0.015113 | 1.235:1 |
| **Recorded floor**                           | 0.008    | 1.15:1  |

The floors sit close to the measured values on purpose. A floor with generous
headroom does not prevent flattening; it permits it right up to the floor. This
is a ratchet, not a target.

**The focus ring** is `focus`, at 5.74 / 4.92 / 3.98:1 against the three
surfaces — all clear WCAG 2.2 SC 1.4.11 (3:1). That is why the token set carries
a separate lightened blue rather than reusing `brand-blue`, which manages 2.51:1
on a well and would have failed.

The ring is drawn in two parts, because contrast against the _surface_ is not
the whole problem: against the fills the skin itself produces, `focus` measures
1.35:1 on `accent` and 1.01:1 on `error`. `outline-offset` pushes the blue clear
of the control and a `box-shadow` fills that gap with the canvas token, so the
ring has `background` on its inner edge whatever the control is filled with.

## Elevation on near-black

The usual instrument fails: a black drop shadow on a near-black canvas is
invisible, and the colour step between planes is real but narrow. So each raised
level pairs an ambient shadow with an **inset lit rim** — a one-pixel highlight
along the top edge, which does not depend on the backdrop at all. It is why a
menu is legible over a panel even though both sit on the same rung.

## Uninstall

Removing the plugin removes the skin, in this order:

1. the scope attribute comes off `<body>` — every declaration stops matching
   immediately, before the stylesheet is even detached;
2. the style element is removed.

Nothing is ever written inline on any element, so there is no previous value
that has to have been remembered correctly. The teardown is registered with
`ctx.effect()`, so it belongs to the plugin's fiber and runs on unload, update
and HMR.

## Building

`build.config.mjs` declares one client half. `pnpm run build:plugins` discovers
it; nothing central needs editing.

`pnpm --filter @trythursday/thursday-skin run typecheck` needs
`packages/tokens/dist` to exist, since the tokens package is typed from its
build output — run `pnpm build` first in a clean tree, which `pnpm check`
already does.

## Scripts

| Script      | What it runs                    |
| ----------- | ------------------------------- |
| `test`      | `vitest run` — 84 tests         |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
