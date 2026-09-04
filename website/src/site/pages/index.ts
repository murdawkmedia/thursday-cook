/**
 * The landing page SCAFFOLD.
 *
 * Deliberately copy-free: this ticket builds the frame and the design system,
 * and a later content ticket writes the words. Every section below is a real
 * section with real structure, real headings and a `slot()` naming what belongs
 * in it, so the content ticket replaces prose rather than inventing layout.
 */
import { badge, button, callout, panel, slot } from "../components";
import { html } from "../html";
import { renderPage } from "../layout";

export function indexPage(): string {
  const body = html`<div class="stack">
    <section class="section" aria-labelledby="lede">
      <p class="section__eyebrow">Placeholder</p>
      <h1 id="lede" style="font-size: var(--web-text-display)">The landing page goes here</h1>
      ${slot(
        "slot: lede",
        "One sentence saying what Thursday is, at --web-text-lead, inside the 68ch measure. No gradient, no hero image: the mark and the sentence.",
      )}
      <div class="row">
        ${button({ label: "Primary call to action", variant: "primary", href: "/design/" })}
        ${button({ label: "Secondary", variant: "secondary", href: "/design/" })}
      </div>
    </section>

    <section class="section" aria-labelledby="what">
      <h2 id="what">What it is</h2>
      ${slot(
        "slot: three capability panels",
        "Three .panel blocks, one per capability, each a mono title and two or three lines of body. Panels, not floating cards.",
      )}
      <div class="grid">
        ${panel({ title: "capability-one", aside: badge("todo"), body: html`<p class="slot__brief">Body copy.</p>` })}
        ${panel({ title: "capability-two", aside: badge("todo"), body: html`<p class="slot__brief">Body copy.</p>` })}
        ${panel({ title: "capability-three", aside: badge("todo"), body: html`<p class="slot__brief">Body copy.</p>` })}
      </div>
    </section>

    <section class="section" aria-labelledby="install">
      <h2 id="install">Install</h2>
      ${slot("slot: install", "The single command, in a <pre>, plus the requirements line under it.")}
      <pre><code># the real command lands with the content ticket
pnpm add -g thursday</code></pre>
    </section>

    <section class="section" aria-labelledby="next">
      <h2 id="next">For the content ticket</h2>
      ${callout(
        "info",
        "The design system is already built",
        html`Compose from the vocabulary on the <a href="/design/">design system page</a> — panels,
          buttons, chips, badges, fields, tabs, callouts, tables, code blocks — rather than adding
          new CSS. If something genuinely new is needed, add it to
          <code>src/styles/components.css</code> in token terms only.`,
      )}
    </section>
  </div>`;

  return renderPage({
    title: "Overview",
    description: "Thursday — an AI development environment built on DeepSeek Harness.",
    current: "/",
    body,
  });
}
