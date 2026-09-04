# website

The trythursday.org site: static HTML and CSS, wired to `@thursday/tokens`.

This package is the **scaffold and the design system**. The landing page copy
is a later ticket's job; every section on `/` is a real section with a `slot()`
naming what belongs in it, so that ticket writes words rather than layout.

## Build

```
pnpm --filter @thursday/website run build    # -> dist/, plain static files
pnpm --filter @thursday/website run typecheck
pnpm --filter @thursday/website run test
```

`dist/` is a directory of files. There is no server-side runtime, no client
framework and no hydration step: open `dist/index.html` behind any static host.

## Why there is no framework here

Two pages, one 60-line enhancement script. Astro, Next or Eleventy would each
add a build runtime, a template dialect and a dependency tree to emit files
that `scripts/build.mjs` emits in about a hundred lines, using the esbuild,
TypeScript, prettier and vitest that the workspace root already installs for
every package. It is also the pattern the repository already uses:
`packages/tokens` builds itself the same way. **New third-party dependencies
for this package: none.** The only dependency is the workspace's own
`@thursday/tokens`.

The build does four things:

1. bundles `src/site/build.ts` to `build/generate.mjs` and runs it, writing one
   `index.html` per page;
2. bundles `src/styles/site.css`, whose first line is
   `@import "@thursday/tokens/tokens.css"` — esbuild resolves that through the
   workspace package's `exports` map, so the site's `:root` block **is** the
   token package's emitted artifact rather than a copy of it;
3. bundles `src/client/enhance.ts` to one ES module;
4. formats the emitted HTML with the workspace prettier, which — because
   prettier parses before it prints — fails the build on markup that does not
   parse.

## Layout

```
website/
  scripts/build.mjs        the whole build: esbuild x3, run generator, format
  src/
    site/                  runs at build time, on Node
      html.ts              escaped-by-default tagged template (~50 lines)
      components.ts        the component vocabulary as typed functions
      layout.ts            the document shell: skip link, banner, main, footer
      build.ts             the page table and the file writes
      pages/index.ts       the landing-page SCAFFOLD (no copy yet)
      pages/design.ts      the design system, generated from the token table
    client/enhance.ts      the only script: roving-tabindex tabs
    styles/
      site.css             entry; imports the token package, then the three below
      base.css             reset, type scale, focus ring
      layout.css           page frame
      components.css       panels, buttons, chips, tabs, fields, tables, callouts
  tests/site.test.ts       guard rails for the content ticket
  dist/                    emitted site (gitignored)
```

## The rules this package holds itself to

**No colour literals.** Every colour, radius and border colour in `src/styles`
is a `var(--th-*)`. What is defined locally is only what the token package
deliberately does not cover — type scale, spacing, line and ring widths — and
those carry a `--web-` prefix so the two can never be confused. A test asserts
both halves, and the token package's own repository-wide scan covers the rest.

**Two radii, not interchangeable.** `--th-radius-control` (3px) on anything a
hand touches: button, input, chip, tab, badge, keycap. `--th-radius-container`
(0.75rem) on anything that holds those: panel, well, code block, callout.
Square where the hands are, rounded where the structure is.

**Two borders, and the difference is accessibility.** `--th-border` is chrome —
dividers, panel outlines, table rules, tab rails — and never the only edge of a
control. Any outline that *is* the sole identifier of a control uses
`--th-border-strong`, which clears WCAG 1.4.11's 3:1 on all three surfaces
where `--th-border` clears it on none. `tests/site.test.ts` fails if a
secondary button, chip, input or keycap drifts to the hairline.

**Keyboard first.** The skip link is the first focusable node on every page.
One `:focus-visible` rule draws every ring, in `--th-focus`, as an `outline`
(so it survives forced-colors mode and never reflows the control) offset by 2px
(so it never sits on the control's own edge). Nothing anywhere suppresses it;
the test counts `outline: none` occurrences and requires exactly the one
`:focus:not(:focus-visible)` guard.

## For the content ticket

`/design/` is the working design system — type scale, surface ladder, both
radii, both borders, the full palette with measured contrast, and the control
set. It is generated from `@thursday/tokens` at build time, so it cannot
describe a token set that no longer exists.

Compose pages from `src/site/components.ts`. If something genuinely new is
needed, add it to `src/styles/components.css` in token terms only.
