/**
 * Thursday Skin: the dsh web client, in Thursday's palette.
 *
 * The plugin itself is small on purpose -- the skin is the stylesheet, and the
 * stylesheet is generated from the tokens. This file only decides WHEN it is in
 * the document, and makes sure that removing the plugin removes the skin.
 *
 * UNINSTALL WITH NO RESIDUE, which is a criterion and not a nicety:
 *
 *   1. the scope attribute is removed from `<body>`, at which point every
 *      declaration in the stylesheet stops matching -- the page is back to dsh
 *      before the style element has even been detached;
 *   2. the style element is removed;
 *   3. nothing was ever written inline on any element, so there is no previous
 *      value that has to have been remembered correctly.
 *
 * Step 1 is what makes step 2 safe to get wrong. The reverse ordering -- style
 * element first, attribute second -- would be a visible flash of unskinned UI.
 *
 * The teardown is registered with `ctx.effect()` so it belongs to this plugin's
 * fiber and runs on unload, update and HMR. `ctx.on("dispose")` is the fallback
 * for a host that predates `effect`; if neither exists the plugin still applies
 * and says so, rather than pretending it can clean up after itself.
 */

import { buildStylesheet } from "./stylesheet";
import { PLUGIN_NAME, SCOPE_ATTRIBUTE, STYLE_ID } from "./scope";

/**
 * The slice of the Cordis context this plugin uses.
 *
 * Typed structurally and optionally rather than imported from dsh: the client
 * half is bundled with `@deepseek-ai/*` external, so a real import would be a
 * build-time dependency on a package that is only resolvable inside a dsh
 * install.
 */
export interface SkinContext {
  effect?: (setup: () => () => void) => unknown;
  on?: (event: string, listener: () => void) => unknown;
}

/** Cordis service dependencies. The skin has none: it only needs a document. */
export const inject: string[] = [];

/** The plugin name Cordis displays. */
export const name = PLUGIN_NAME;

/**
 * Put the skin into a document and return the function that takes it out.
 *
 * Exported so the tests can mount and unmount against a real DOM rather than
 * asserting on a string and hoping.
 *
 * Idempotent: mounting twice reuses the existing style element instead of
 * stacking a second copy, because HMR and a double `apply` both happen.
 */
export function mount(doc: Document): () => void {
  const selector = `style[data-plugin-css="${STYLE_ID}"]`;
  const existing = doc.querySelector(selector) as HTMLStyleElement | null;

  let style: HTMLStyleElement;
  let owned: boolean;
  if (existing !== null) {
    style = existing;
    owned = false;
  } else {
    style = doc.createElement("style");
    style.dataset.plugin = PLUGIN_NAME;
    style.dataset.pluginCss = STYLE_ID;
    style.textContent = buildStylesheet();
    doc.head.appendChild(style);
    owned = true;
  }

  doc.body.setAttribute(SCOPE_ATTRIBUTE, "");

  return () => {
    // Attribute first: the page is unskinned the instant this line runs.
    doc.body.removeAttribute(SCOPE_ATTRIBUTE);
    if (owned) style.remove();
  };
}

/** Cordis entry point. */
export function apply(ctx: SkinContext): void {
  // A host with no document (SSR, a test importing the module) is not an error;
  // there is simply nothing to skin.
  if (typeof document === "undefined") return;

  if (typeof ctx?.effect === "function") {
    ctx.effect(() => mount(document));
    return;
  }
  if (typeof ctx?.on === "function") {
    const unmount = mount(document);
    ctx.on("dispose", unmount);
    return;
  }

  mount(document);
  // eslint-disable-next-line no-console
  console.warn(
    `${PLUGIN_NAME}: this host provides neither ctx.effect nor ctx.on, so the ` +
      `skin cannot register its own teardown and will survive unload. Remove ` +
      `the [${SCOPE_ATTRIBUTE}] attribute from <body> to reverse it by hand.`,
  );
}
