/**
 * Thursday Fonts: web typeface loading plugin.
 * 
 * Loads Thursday's three-typeface system:
 * - Literata (serif, body text)
 * - Inter (sans-serif, UI)
 * - Fantasque Sans Mono (monospace, code)
 * 
 * Registers as CSS font-family variables with system fallbacks for offline.
 * Uses `html:root` selector for consistency with TH1 skin plugin.
 */

const PLUGIN_NAME = "thursday-fonts";

/**
 * The three families, served from Thursday's own assets.
 *
 * BUNDLED, NOT LINKED, and the distinction is the ticket. A webfont fetched
 * from a third party fails in exactly the cases Thursday cares about most: the
 * container, the offline install, and the machine behind a firewall that does
 * not resolve fonts.googleapis.com. It is also a request to a third party on
 * every page load, which is a privacy cost the user did not agree to. An
 * earlier revision of this file carried an `@import` from Google Fonts; it
 * failed four of TH4's six criteria in one line.
 *
 * Literata and Inter are VARIABLE fonts: Google serves one file across the
 * whole weight axis, and the 400 and 600 downloads were byte-identical, so one
 * file per family covers every weight through `font-weight: 100 900`.
 *
 * `local()` comes first in each `src` so a user who already has the family
 * installed pays no download at all. The bundled copy is the fallback, not the
 * first choice.
 *
 * All three are SIL Open Font License, which is what makes bundling permitted;
 * the licence files ship beside the fonts in assets/fonts/ and shipping without
 * them is what would make it not permitted.
 */
const FONTS_CSS = `
@font-face {
  font-family: "Literata";
  src: local("Literata"), url("/assets/fonts/literata-variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: local("Inter"), url("/assets/fonts/inter-variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: "Fantasque Sans Mono";
  src: local("Fantasque Sans Mono"), local("FantasqueSansMono-Regular"),
       url("/assets/fonts/fantasque-sans-mono.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}

html:root {
  /* Literata: serif body text and the top-left wordmark, designed for long form */
  --th-font-serif: Literata, Georgia, serif;

  /* Inter: geometric sans-serif for UI, legible at small sizes */
  --th-font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /*
   * Fantasque Sans Mono for code. The stack ENDS IN THE `monospace` GENERIC,
   * which dsh's own stack does not: dsh ends at a named font, so a machine
   * missing every name in the list falls through to a proportional face and
   * code stops lining up. The generic makes that impossible.
   */
  --th-font-mono: "Fantasque Sans Mono", ui-monospace, "SF Mono", Monaco, Consolas, monospace;
}
`;

/**
 * Inject one stylesheet into the document head, once per style id.
 * Guards against double-injection and respects document availability.
 */
function injectStyle(pluginName: string, styleId: string, cssText: string): void {
  if (typeof document === "undefined") return;
  
  // Check if already injected
  if (document.querySelector(`style[data-plugin-css="${styleId}"]`) !== null) {
    return;
  }
  
  const tag = document.createElement("style");
  tag.dataset.plugin = pluginName;
  tag.dataset.pluginCss = styleId;
  tag.textContent = cssText;
  document.head.appendChild(tag);
}

const inject: string[] = [];
const name = PLUGIN_NAME;

function apply(ctx: any) {
  injectStyle(PLUGIN_NAME, "thursday-fonts", FONTS_CSS);
}

export { apply, inject, name };
