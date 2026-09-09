/**
 * Thursday Mark (client half): the dolphin leaves, the cross arrives.
 *
 * WHAT IT REPLACES, exactly. dsh's official brand plugin renders this, in
 * `@deepseek-ai/dsh-client-ui-brand-official/lib/client.js`:
 *
 *     function OfficialBrandMark({ size, className }) {
 *       return jsx(FishLogo, { size, className });
 *     }
 *     function apply(ctx) {
 *       ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject(
 *         "sidebar.brand.name", () => ctx.slots.inject(
 *           "conversation.hero.brand.mark", function* () {
 *             yield ctx.slots.register({ name: "sidebar.brand.mark" }, OfficialBrandMark);
 *             yield ctx.slots.register({ name: "sidebar.brand.name" }, OfficialBrandName);
 *             yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, OfficialBrandMark);
 *           })));
 *     }
 *
 * Four facts fall out of that, and all four shape this file:
 *
 *   1. THE SLOTS ARE THE SEAM, not the bundle. These are ordinary UI slots,
 *      and registering IS shadowing: the dsh-client-runner README states
 *      "newest run wins", and Thursday's plugins load after the built-ins, so
 *      this plugin's registrations cover the whale wherever it swims. No
 *      bundle is patched, which is what keeps a normal dsh install's branding
 *      untouched -- this plugin ships in the Thursday home only.
 *   2. THE MARK SLOTS ARE TWO, not three. `sidebar.brand.name` is the
 *      wordmark, and the wordmark belongs to TH4 (typography), not to this
 *      ticket. Taking it here would ship a Thursday name in dsh's voice and
 *      step on the ticket that owns the voice. This file registers
 *      `sidebar.brand.mark` (the in-app top-left) and
 *      `conversation.hero.brand.mark`, and leaves `.name` alone on purpose.
 *   3. `inject` BEFORE `register`. A direct `register()` into an undeclared
 *      slot throws; `inject` waits for the declaration and runs the callback
 *      synchronously once it exists. The nesting waits for BOTH declarations
 *      before registering either, and the generator yields both registrations
 *      as one transaction: a setup failure rolls the first back, and teardown
 *      runs them in reverse. Same shape as the official plugin, on purpose.
 *   4. UNINSTALL IS THE FIBER. The inject controller belongs to this plugin's
 *      fiber, so unloading removes both registrations. The only raw-DOM side
 *      effect is the keyframe stylesheet, which `mount()` returns a remover
 *      for and `apply()` hands to `ctx.effect()`, the way thursday-skin does.
 *
 * This file contains no JSX syntax. The SVG arrives as the `MARK_SVG` string
 * from `./mark` (pure, asserted without a browser), and the component hands it
 * to the `react` global dsh injects into the browser bundle -- the same global
 * `tsconfig.client.json` exists to compile against. There is no `react`
 * import because there is no importable module at bundle time.
 */

import { MARK_CLASS, MARK_DEFAULT_SIZE, MARK_SVG, PLUGIN_NAME, buildMarkStylesheet } from "./mark";

/** The two mark slots this plugin shadows. `.name` is TH4's, deliberately. */
export const MARK_SLOTS: readonly string[] = ["sidebar.brand.mark", "conversation.hero.brand.mark"];

/** Value of the style element's `data-plugin-css` attribute. */
export const STYLE_ID = PLUGIN_NAME;

/**
 * The `react` global the dsh browser bundle injects.
 *
 * Typed structurally and minimally: this component calls one function with
 * two arguments, and the tests stub exactly that.
 */
declare const react: {
  createElement(type: string, props: Record<string, unknown> | null): unknown;
};

/** Props dsh passes to a brand-mark slot component. */
export interface BrandMarkProps {
  /** Requested edge length in pixels; dsh's own mark honours it, so this one does. */
  readonly size?: number | string;
  /** Host-supplied class, merged after the plugin's own. */
  readonly className?: string;
}

/** Cordis service dependencies. The mark needs the slot registry: nothing else. */
export const inject: string[] = ["slots"];

/** The plugin name Cordis displays. */
export const name = PLUGIN_NAME;

/**
 * Thursday's mark as a slot component.
 *
 * Honours `size` (width and height together, so the square viewBox never
 * distorts) and merges `className` after the plugin's own class, the way the
 * official mark honours both. Hidden from assistive technology: the adjacent
 * `.name` slot carries the product name, so announcing the mark too would
 * read it twice.
 */
export function ThursdayMark(props: BrandMarkProps): unknown {
  const size: number | string = props.size ?? MARK_DEFAULT_SIZE;
  const className: string =
    MARK_CLASS + (props.className !== undefined && props.className !== "" ? " " + props.className : "");
  return react.createElement("span", {
    className,
    style: { width: size, height: size },
    dangerouslySetInnerHTML: { __html: MARK_SVG },
    "aria-hidden": "true",
  });
}

/**
 * The slice of the Cordis context this plugin uses.
 *
 * Typed structurally and optionally rather than imported from dsh: the client
 * half is bundled with `@deepseek-ai/*` external, so a real import would be a
 * build-time dependency on a package that is only resolvable inside a dsh
 * install. Same reasoning as thursday-skin and thursday-thinking.
 */
export interface MarkSlotsService {
  inject(slotName: string, callback: () => unknown): unknown;
  register(options: { name: string }, component: unknown): () => void;
}

export interface MarkContext {
  effect?: (setup: () => () => void) => unknown;
  on?: (event: string, listener: () => void) => unknown;
  slots: MarkSlotsService;
}

/** The slice of Document `mount()` touches. Narrower than Document on purpose. */
export interface StyleDocument {
  querySelector(selector: string): { textContent: string } | null;
  createElement(tagName: string): {
    dataset: Record<string, string>;
    textContent: string;
  };
  head: { appendChild(child: { remove(): void }): void };
}

/**
 * Put the keyframe stylesheet into a document and return the function that
 * takes it out.
 *
 * Exported so the tests can mount and unmount against a stub document rather
 * than asserting on a string and hoping. Idempotent: mounting twice reuses
 * the existing style element instead of stacking a second copy, because HMR
 * and a double `apply` both happen.
 */
export function mount(doc: StyleDocument): () => void {
  const selector = 'style[data-plugin-css="' + STYLE_ID + '"]';
  const existing = doc.querySelector(selector) as unknown as { remove(): void } | null;

  let owned: { remove(): void } | null = null;
  if (existing === null) {
    const style = doc.createElement("style");
    style.dataset.plugin = PLUGIN_NAME;
    style.dataset.pluginCss = STYLE_ID;
    style.textContent = buildMarkStylesheet();
    doc.head.appendChild(style as unknown as { remove(): void });
    owned = style as unknown as { remove(): void };
  }

  return () => {
    if (owned !== null) owned.remove();
  };
}

/**
 * Register both mark slots, transactionally.
 *
 * Exported so the tests can drive it against a fake slot registry. The outer
 * `inject` waits for the sidebar declaration, the inner for the hero
 * declaration, and the generator yields the two registrations as one
 * transaction -- setup failure rolls the first back, teardown reverses them.
 */
export function registerMarkSlots(ctx: MarkContext): unknown {
  return ctx.slots.inject(MARK_SLOTS[0] as string, () =>
    ctx.slots.inject(MARK_SLOTS[1] as string, function* () {
      yield ctx.slots.register({ name: MARK_SLOTS[0] as string }, ThursdayMark);
      yield ctx.slots.register({ name: MARK_SLOTS[1] as string }, ThursdayMark);
    }),
  );
}

/** Cordis entry point. */
export function apply(ctx: MarkContext): void {
  // A host with no document (SSR, a test importing the module) is not an error;
  // there is simply nothing to paint into.
  if (typeof document === "undefined") return;

  const start = (): (() => void) => {
    // The slot registrations belong to this plugin's fiber through the inject
    // controller, so they need no manual teardown; the stylesheet is raw DOM
    // and does, which is what the returned remover owns.
    registerMarkSlots(ctx);
    return mount(document as unknown as StyleDocument);
  };

  if (typeof ctx?.effect === "function") {
    ctx.effect(start);
    return;
  }
  if (typeof ctx?.on === "function") {
    const stop = start();
    ctx.on("dispose", stop);
    return;
  }

  start();
  // eslint-disable-next-line no-console
  console.warn(
    PLUGIN_NAME +
      ": this host provides neither ctx.effect nor ctx.on, so the keyframe " +
      "stylesheet cannot register its own teardown and will survive unload.",
  );
}
