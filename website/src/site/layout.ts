/**
 * The document shell every page is poured into.
 *
 * Order matters for keyboard use: the skip link is the first focusable node in
 * the document, so the very first Tab on any page offers a jump past the
 * banner to `#main`.
 */
import { html, toDocument, type Html } from "./html";

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/design/", label: "Design system" },
];

export interface PageOptions {
  /** Page title, without the site suffix. */
  readonly title: string;
  readonly description: string;
  /** The nav href to mark as current, or null when none applies. */
  readonly current: string | null;
  /** Depth-independent because every emitted URL is absolute from the root. */
  readonly body: Html;
}

export function renderPage(options: PageOptions): string {
  const navLinks = NAV.map(
    (item) =>
      html`<a
        class="nav__link"
        href="${item.href}"
        ${item.href === options.current ? html`aria-current="page"` : null}
        >${item.label}</a
      >`,
  );

  return toDocument(
    html`<html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${options.title} — Thursday</title>
        <meta name="description" content="${options.description}" />
        <meta name="color-scheme" content="dark" />
        <link rel="icon" href="/assets/thursday-logo.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/site.css" />
        <script src="/assets/enhance.js" type="module" defer></script>
      </head>
      <body>
        <div class="page">
          <a class="skip-link" href="#main">Skip to content</a>
          <header class="banner">
            <div class="shell banner__inner">
              <a class="brand" href="/">
                <img
                  class="brand__mark"
                  src="/assets/thursday-logo.svg"
                  alt=""
                  width="20"
                  height="20"
                />
                <span>Thursday</span>
                <span class="brand__sub">an AI development environment</span>
              </a>
              <nav class="nav" aria-label="Primary">${navLinks}</nav>
            </div>
          </header>
          <main class="main" id="main" tabindex="-1">
            <div class="shell">${options.body}</div>
          </main>
          <footer class="footer">
            <div class="shell footer__inner">
              <p>Thursday — built on DeepSeek Harness. MIT licensed.</p>
              <p>
                Colour and shape from
                <code>@trythursday/tokens</code>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>`,
  );
}
