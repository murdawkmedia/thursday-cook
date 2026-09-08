/**
 * Thursday Thinking: the working indicator, in Thursday's voice.
 *
 * WHAT IT REPLACES, exactly. dsh's conversation client renders this, in
 * `@deepseek-ai/dsh-client-ui-conversation/lib/client.js`:
 *
 *     function TurnStatus({ startTime, t }) { ...
 *       return jsxs("div", { className: css.turnStatus, role: "status",
 *         "aria-live": "polite",
 *         children: ["Deep diving...", showClock && jsx("span", {
 *           className: css.turnStatusClock, "aria-hidden": true, ... })] });
 *
 * Three facts fall out of that, and all three shape this file:
 *
 *   1. THE TEXT IS A BARE TEXT NODE, not an element, so it cannot be hidden
 *      with a selector. It has to be emptied, and its original value kept so
 *      teardown can put it back.
 *   2. THE CLASS IS A CSS-MODULE HASH -- `Md3f7G_turnStatus` in the build on
 *      this machine. The hash moves on every dsh release, so matching it
 *      literally would work today and break at the next upgrade. The selector
 *      below matches the readable half and excludes the clock span that shares
 *      the prefix. This is still DOM scraping against somebody else's bundle,
 *      and the honest fix is a slot in dsh; until there is one, the plugin
 *      warns once and does nothing rather than half-applying.
 *   3. REACT OWNS THAT SUBTREE and will re-render it -- every second, in fact,
 *      once the elapsed clock appears -- putting "Deep diving..." straight
 *      back. So the takeover cannot be a one-shot: a MutationObserver watches
 *      for the text returning and re-applies. Appending our own element as an
 *      extra child is safe because React only ever removes children it created
 *      itself, by reference.
 *
 * Everything with a side effect is undone by the function `mount()` returns,
 * and `apply()` hands that to `ctx.effect()` so it belongs to the fiber.
 */

import { INDICATOR_CLASS, MARK_SVG, PHRASE_CLASS, buildIndicatorStylesheet } from "./indicator";
import { PHRASES, ROTATION } from "./phrases";
import { createRotation } from "./rotation";
import type { RandomSource } from "./rotation";

/** The plugin name Cordis displays, and the style element's marker. */
export const PLUGIN_NAME = "thursday-thinking";

/**
 * dsh's turn-status element.
 *
 * `[class*="_turnStatus"]` survives the CSS-module hash changing, because the
 * generator keeps the readable name after the underscore. The `:not()` drops
 * `Md3f7G_turnStatusClock`, which shares the prefix and is a child of the very
 * element we want.
 */
export const HOST_SELECTOR = '[class*="_turnStatus"]:not([class*="turnStatusClock"])';

/** Cordis service dependencies. None: this needs a document and nothing else. */
export const inject: string[] = [];

/** The plugin name Cordis displays. */
export const name = PLUGIN_NAME;

/** Timer surface, injected so tests drive the rotation without waiting. */
export interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface MountOptions {
  /** The document to mount into. */
  readonly document: Document;
  /** Defaults to the document's own view, then to `globalThis`. */
  readonly timers?: Timers;
  /** Injected so a test can make the phrase order deterministic. */
  readonly random?: RandomSource;
}

/** What `mount()` did, for the tests to inspect without reaching into the DOM. */
export interface Mounted {
  /** Undo everything. Safe to call twice. */
  dispose(): void;
  /** The phrase currently displayed. */
  current(): string;
  /** Advance the rotation by hand, as the interval would. */
  advance(): void;
}

interface Taken {
  host: Element;
  indicator: Element;
  /**
   * The element holding the phrase, kept by reference rather than re-queried.
   *
   * The mark arrives as `innerHTML` because it is a static SVG string, but the
   * phrase element is built with `createElement` and held onto: querying back
   * into markup this file just wrote would be a round trip through the parser
   * for no gain, and it would make the whole takeover untestable without a
   * full HTML parser in the test.
   */
  phrase: Element;
  /** The text nodes we emptied, with what they said. */
  blanked: Array<{ node: { nodeValue: string | null }; original: string }>;
}

/**
 * Empty the direct text-node children of an element, remembering them.
 *
 * Only DIRECT children: the elapsed-time clock is a child SPAN with its own
 * text, and blanking that would delete information the user asked for by
 * waiting fifteen seconds. It stays.
 */
function blankOwnText(host: Element): Taken["blanked"] {
  const blanked: Taken["blanked"] = [];
  for (const node of Array.from(host.childNodes)) {
    if (node.nodeType === 3 && typeof node.nodeValue === "string" && node.nodeValue.length > 0) {
      blanked.push({ node, original: node.nodeValue });
      node.nodeValue = "";
    }
  }
  return blanked;
}

/**
 * Put the indicator into a document and return the function that takes it out.
 *
 * Exported so the tests mount and unmount against a document rather than
 * asserting on a string and hoping.
 */
export function mount(options: MountOptions): Mounted {
  const doc = options.document;
  const timers: Timers =
    options.timers ?? ((doc.defaultView ?? (globalThis as unknown)) as unknown as Timers);

  const rotation = createRotation(PHRASES, {
    intervalMs: ROTATION.intervalMs,
    ...(options.random ? { random: options.random } : {}),
  });

  // --- the stylesheet, idempotently ---------------------------------------
  const styleSelector = 'style[data-plugin-css="' + PLUGIN_NAME + '"]';
  const existingStyle = doc.querySelector(styleSelector) as HTMLStyleElement | null;
  let style: HTMLStyleElement;
  let ownsStyle: boolean;
  if (existingStyle !== null) {
    style = existingStyle;
    ownsStyle = false;
  } else {
    style = doc.createElement("style");
    style.dataset.plugin = PLUGIN_NAME;
    style.dataset.pluginCss = PLUGIN_NAME;
    style.textContent = buildIndicatorStylesheet();
    doc.head.appendChild(style);
    ownsStyle = true;
  }

  let phrase = rotation.next();
  let taken: Taken | null = null;
  let disposed = false;

  function paint(): void {
    if (taken !== null) taken.phrase.textContent = phrase;
  }

  /** Attach to the host if it is present and not already ours. Idempotent. */
  function sync(): void {
    if (disposed) return;
    const host = doc.querySelector(HOST_SELECTOR);

    if (host === null) {
      release();
      return;
    }
    if (taken !== null && taken.host === host) {
      // React re-rendered and put its own text back; blank it again. The
      // indicator element itself survives, so the phrase does not restart
      // mid-cycle every time the elapsed clock ticks.
      taken.blanked.push(...blankOwnText(host));
      if (!Array.from(host.childNodes).includes(taken.indicator as unknown as ChildNode)) {
        host.appendChild(taken.indicator);
      }
      return;
    }

    release();

    const indicator = doc.createElement("span");
    indicator.className = INDICATOR_CLASS;
    indicator.innerHTML = MARK_SVG;

    const phraseElement = doc.createElement("span");
    phraseElement.className = PHRASE_CLASS;
    indicator.appendChild(phraseElement);

    const blanked = blankOwnText(host);
    host.appendChild(indicator);
    taken = { host, indicator, phrase: phraseElement, blanked };
    paint();
  }

  /** Give the host element back exactly as we found it. */
  function release(): void {
    if (taken === null) return;
    taken.indicator.remove();
    for (const entry of taken.blanked) {
      if (entry.node.nodeValue === "") entry.node.nodeValue = entry.original;
    }
    taken = null;
  }

  sync();

  // --- keep it applied across React's re-renders ---------------------------
  const ObserverCtor = (doc.defaultView as unknown as { MutationObserver?: unknown } | null)
    ?.MutationObserver as
    | (new (callback: () => void) => { observe(t: Node, o: unknown): void; disconnect(): void })
    | undefined;

  let observer: { disconnect(): void } | null = null;
  if (typeof ObserverCtor === "function") {
    const created = new ObserverCtor(() => sync());
    created.observe(doc.body, { childList: true, subtree: true, characterData: true });
    observer = created;
  }

  const handle = timers.setInterval(() => {
    phrase = rotation.next();
    paint();
  }, rotation.intervalMs);

  return {
    current: () => phrase,
    advance: () => {
      phrase = rotation.next();
      paint();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      timers.clearInterval(handle);
      observer?.disconnect();
      release();
      if (ownsStyle) style.remove();
    },
  };
}

/** The slice of the Cordis context this plugin uses. Typed structurally: the */
/* client half is bundled with `@deepseek-ai/*` external, so a real import
   would be a build-time dependency on a package only resolvable inside a dsh
   install. Same reasoning as thursday-skin. */
export interface ThinkingContext {
  effect?: (setup: () => () => void) => unknown;
  on?: (event: string, listener: () => void) => unknown;
}

/** Cordis entry point. */
export function apply(ctx: ThinkingContext): void {
  if (typeof document === "undefined") return;

  const start = (): (() => void) => {
    const mounted = mount({ document });
    return () => mounted.dispose();
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
      ": this host provides neither ctx.effect nor ctx.on, so the indicator " +
      "cannot register its own teardown and will survive unload.",
  );
}
