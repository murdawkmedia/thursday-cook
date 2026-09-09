# @trythursday/thursday-mark

Replaces dsh's dolphin mark with Thursday's mark in the web UI (client half)
and serves the Thursday favicon and web app manifest from B2's export set
(host half). Colours come only from `@trythursday/tokens`; the ticket exempts
`assets/` (the brand mark lives there), not this plugin.

Ticket TH2.

## Layout

| Path | What it is |
| --- | --- |
| `src/mark.ts` | The mark's geometry and its keyframe stylesheet, both generated strings. No colour typed by hand. |
| `src/client.tsx` | The Cordis client half: registers the two brand-mark slots, installs the stylesheet, removes it on unload. |
| `src/host.ts` | The Cordis host half: exact routes for the favicon, the icons and the manifest, plus the 16px link tap. |
| `tests/mark.test.ts` | Gradient endpoints, the 14-second drift, reduced motion. |
| `tests/client.test.ts` | Slot takeover (and its boundary), stylesheet lifecycle. |
| `tests/host.test.ts` | Route table, manifest honesty, tap idempotence, empty-set degradation. |

## The slot boundary

dsh's official brand plugin fills three slots: `sidebar.brand.mark`,
`sidebar.brand.name`, and `conversation.hero.brand.mark`. This plugin takes
the two MARK slots and leaves `.name` alone on purpose: `.name` is the
wordmark, and the wordmark belongs to TH4 (typography). Taking it here would
ship a Thursday name in dsh's voice. Slot shadowing is newest-run-wins (see
`dsh-cordis-client-runner`'s README), and Thursday plugins load after the
built-ins, so no bundle is patched and a normal dsh install is untouched.

## The animation

CSS on the two gradient stops' opacity, 14 seconds each way, blue-dominant to
orange-dominant and back -- the source logo's `dur="14s"` round trip. SMIL is
refused on purpose: `prefers-reduced-motion` cannot reach inside
`<animateTransform>`, so a verbatim lift would ship motion a sensitive user
cannot turn off. The reduced-motion block pins both stops at full opacity --
the full ramp, the honest static frame. `thursday-thinking` established this
shape; this plugin follows it rather than inventing a second one.

## The 16px variant

`assets/thursday-logo-16.svg` is the favicon/small-size form, and it is NOT a
shrunken source: measured at 16px, the source's 34-unit kerfs render as
0.88px (no separation), its surviving keyline as a 0.26px grey smear, its
translucent mid-stop dithers across 88 colours in 256 pixels, and every head
pixel washes into pastels (lum 161..227). The variant unions the segments,
drops the keyline and shadow, and fits a two-stop full-opacity ramp
horizontally so the caps read near-saturated blue (`#145ef5` measured vs
`#0a5cff`) and orange (`#f5820a` vs `#ff8400`): 49 colours, clean surround,
same silhouette. The diagonal, vertical and solid treatments were measured
and rejected in the ticket report; the reasoning is in the file's header.

B2's 16px raster (`favicon-16.png`, the `.ico`'s 16px layer) should be
regenerated from the variant: `scripts/build-brand-assets.mjs` takes
`--source`, so `node scripts/build-brand-assets.mjs --source
assets/thursday-logo-16.svg --out <tmp>` cuts the small set (that script is
outside this ticket's paths, so the re-run belongs to B2, not here). Until
then the host half serves whatever the export set holds -- softer than
intended, but the same mark.

## Composition wiring (not this ticket)

The host half takes `{ brandDir, appName?, shortName? }` as plugin config and
serves only files that exist; the manifest lists only served icons. Point
`brandDir` at the installed `dist/brand`. Client and host halves are declared
in `build.config.mjs` and discovered automatically; seating them in the
Thursday home's composition belongs to the composition ticket, the way the
skin and the indicator landed before their seating.
