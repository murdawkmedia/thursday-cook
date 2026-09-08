# @trythursday/thursday-thinking

Replaces dsh's `Deep diving...` working indicator with a rotating set of
phrases in Thursday's voice, a small animated Thursday mark to their left, and
a gradient recoloured from dsh's white-to-blue to Thursday's blue-to-orange.

Ticket TH3.

## Layout

| Path | What it is |
| --- | --- |
| `data/phrases.json` | The phrase set, the rotation interval, and the forbidden vocabulary. The only file you edit to add a phrase. |
| `src/phrases.ts` | Typed loader plus every mechanical rule, as pure functions. |
| `src/rotation.ts` | The shuffled queue. No DOM, no timers. |
| `src/indicator.ts` | The mark's SVG and the stylesheet, both generated, no colour typed by hand. |
| `src/client.tsx` | The Cordis client half: takes over dsh's turn-status element and gives it back on unload. |
| `tests/fixtures/published-lists.json` | 481 messages from three published loading-message lists, for the originality check. |
| `scripts/refresh-published-lists.mjs` | Rebuilds that fixture. |

## Adding a phrase

Add a string to `phrases` in `data/phrases.json`, then `pnpm test`. No code
change is needed, and the suite will tell you if the phrase is too long, names
a tool or a model, reads as mythology, or collides with a published list.

Two things the suite cannot tell you, and you have to judge yourself:

1. **Whether it is funny on the second reading.** That is the bar the ticket
   sets and no test reaches it.
2. **Whether it implies an operation without naming one.** The vocabulary bans
   words like `compiling` and `indexing` that have no ordinary use in this
   register, and it bans the system nouns an operation would need an object
   from. It deliberately does *not* ban plain English verbs — `sorting`,
   `checking`, `holding` — because banning them would ban the voice. See the
   header of `tests/phrases.test.ts` for the full argument and its limits.

## The voice

Dry, competent, faintly amused — an assistant you work with, the way Friday is
in the Avengers films. Explicitly **not** a Thor or Norse reference: the name
is a weekday and the product is not about the god, so no thunder, no hammers,
no gods, and nothing about where the word came from. That rule is enforced by
the `mythology` list in the data file, including the Romance branch (`jove`,
`jeudi`) that a Norse-only list would miss.

## Known gaps

- **The dsh seam is unverified in a browser.** `HOST_SELECTOR` was derived by
  reading `@deepseek-ai/dsh-client-ui-conversation/lib/client.js`, where the
  indicator renders as `<div class="Md3f7G_turnStatus" role="status">` with
  `"Deep diving..."` as a bare text node. The selector matches the readable
  half of the CSS-module name so a rebuilt hash does not break it, but this is
  still scraping somebody else's bundle. A slot in dsh is the real fix.
- **The originality fixture ages.** It is a snapshot; run the refresh script.
