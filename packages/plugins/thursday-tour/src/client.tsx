/**
 * Thursday Tour (client half): the visible tutorial panel.
 *
 * THE SANCTIONED ROUTE. The entry registers into `shell.overlay` -- the
 * additive list slot for surfaces floating over the whole app,
 * click-through until an entry opts into pointer events. Registering at the
 * render-tree root would SHADOW ui-layout's AppFrame and render the tour
 * alone with every seat the frame declares gone; the registration test pins
 * the slot name so that mistake fails rather than ships.
 *
 * RENDERED, NOT HIDDEN. Thursday's positioning is that you can see what is
 * happening, and a tutorial working by concealed machinery would teach the
 * opposite in the first five minutes. The panel shows the tour's structure;
 * the delight comes from the prefill, not from invisibility.
 *
 * This file contains no JSX syntax. Components are `react.createElement`
 * calls against the `react` global dsh injects into the browser bundle --
 * the same global `tsconfig.client.json` exists to compile against, and
 * the same reason thursday-mark states: there is no importable module at
 * bundle time. Live state (the spotlight rect, the prefill outcome) lives
 * in `TourApp` hooks; everything else is a pure function tested against
 * stubs: `TourController` (which step, and what each button may do),
 * `TourOverlay` (the element tree for one step), `resolveTarget` (the
 * selector lookup with its loud-missing path).
 */

import { STEPS } from "./steps.generated";
import { describeCondition, isDetectStep } from "./steps";
import type { TourStep } from "./steps";
import { attemptPrefill } from "./prefill";
import type { PrefillReport } from "./progress";
import { isRectVisible, placeCard, rectsForHole } from "./spotlight";
import type { Rect, Viewport } from "./spotlight";
import { STYLE_ID, TOUR_CLASS, buildTourStylesheet } from "./stylesheet";

/** Re-exported: the style element's marker, for diagnostics and tests. */
export { STYLE_ID };

/** The plugin name Cordis displays, and the style element's marker. */
export const PLUGIN_NAME = "thursday-tour";

/**
 * The overlay seat. Pinned as a constant (and in the registration test)
 * because the wrong slot here is catastrophic, not cosmetic: see above.
 */
export const OVERLAY_SLOT = "shell.overlay";

/** Card width, matching the stylesheet (geometry needs a number). */
export const CARD_WIDTH = 340;
/** Card height estimate for placement; clamping keeps it on screen anyway. */
export const CARD_HEIGHT = 280;

/**
 * The `react` global the dsh browser bundle injects.
 *
 * Typed structurally and minimally: this file calls `createElement` and
 * the three hooks below, and the tests stub exactly that.
 */
declare const react: {
  createElement(
    type: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  useState<S>(initial: S): [S, (next: S | ((prev: S) => S)) => void];
  useEffect(setup: () => (() => void) | void, deps?: unknown[]): void;
  useRef<T>(initial: T): { current: T };
};

/** Development means loud: a selector matching nothing is a defect. */
export function isDev(overrides?: { env?: string }): boolean {
  if (overrides?.env !== undefined) return overrides.env !== "production";
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return proc?.env?.NODE_ENV !== "production";
}

/**
 * One `getBoundingClientRect` of the step's element, or null. Never throws:
 * a selector the engine rejects and a document without the method both
 * mean "no rect", and the missing path -- not an exception -- is what the
 * panel is built to handle.
 */
export function resolveTarget(
  doc: { querySelector(selector: string): { getBoundingClientRect(): Rect } | null },
  selector: string,
): Rect | null {
  let element: { getBoundingClientRect(): Rect } | null = null;
  try {
    element = doc.querySelector(selector);
  } catch {
    return null;
  }
  if (element === null) return null;
  try {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  } catch {
    return null;
  }
}

/**
 * Which step the panel shows, and what each button may do. No DOM, no
 * react: the rule that detect steps have no Next button is a unit test
 * over this class, not a browser session.
 */
export class TourController {
  private index = 0;
  private readonly skipped = new Set<string>();
  private readonly finished = new Set<string>();
  private exited = false;
  private readonly prefills = new Map<string, PrefillReport>();

  constructor(private readonly steps: readonly TourStep[] = STEPS) {}

  current(): TourStep | null {
    if (this.exited) return null;
    return (
      this.steps.find((step) => !this.finished.has(step.id) && !this.skipped.has(step.id)) ?? null
    );
  }

  position(): number {
    const step = this.current();
    if (step === null) return this.steps.length;
    return this.steps.indexOf(step) + 1;
  }

  isExited(): boolean {
    return this.exited;
  }

  prefillFor(stepId: string): PrefillReport | null {
    return this.prefills.get(stepId) ?? null;
  }

  notePrefill(stepId: string, report: PrefillReport): void {
    this.prefills.set(stepId, report);
  }

  /**
   * The Next button. Manual steps only: a detect step advances itself when
   * the thing happens, and a Next on one would invite the user to claim
   * what did not happen. Throws, so wiring a Next onto a detect step
   * fails instead of silently claiming.
   */
  next(stepId: string): void {
    const step = this.steps.find((candidate) => candidate.id === stepId);
    if (step === undefined) throw new Error(`${PLUGIN_NAME}: unknown step "${stepId}"`);
    if (isDetectStep(step)) {
      throw new Error(`${PLUGIN_NAME}: step "${stepId}" completes by detection, not by Next`);
    }
    this.finished.add(stepId);
    this.index += 1;
  }

  /** Skip this step: every step carries a way out. */
  skip(stepId: string): void {
    this.skipped.add(stepId);
    this.index += 1;
  }

  /** Exit the tour: the panel stands down until the user returns. */
  exit(): void {
    this.exited = true;
  }
}

/** The host-call facade, when the runner provides one. Probed, not assumed. */
export interface HostCallFacade {
  call(method: string, args?: unknown): Promise<unknown>;
}

export function hostFacade(): HostCallFacade | null {
  const host = (globalThis as { host?: unknown }).host;
  if (typeof host !== "object" || host === null) return null;
  const call = (host as { call?: unknown }).call;
  if (typeof call !== "function") return null;
  return host as HostCallFacade;
}

/**
 * Tell the host half about a local action, when a transport exists. The
 * bundled client has no verified client→host transport in this dsh
 * release, so absence is the expected case and degrades to local-only
 * progress -- never to an error, and never to a claim: these are UI
 * affordances (Next on manual, skip, exit), not completion reports.
 */
export function notifyHost(method: string, args: Record<string, unknown>): void {
  const facade = hostFacade();
  if (facade === null) return;
  try {
    const pending = facade.call(method, args) as Promise<unknown>;
    if (
      pending !== null &&
      typeof pending === "object" &&
      typeof (pending as { catch?: unknown }).catch === "function"
    ) {
      void (pending as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    /* the panel already updated locally; a failed sync must not undo it */
  }
}

export interface TourOverlayProps {
  readonly step: TourStep;
  readonly position: number;
  readonly total: number;
  /** One rect from the step's selector, or null when it matched nothing. */
  readonly rect: Rect | null;
  readonly viewport: Viewport;
  /** Loud missing-selector path (dev/tests); card-without-spotlight in prod. */
  readonly dev: boolean;
  readonly prefill: PrefillReport | null;
  readonly onNext: (stepId: string) => void;
  readonly onSkip: (stepId: string) => void;
  readonly onExit: () => void;
}

/**
 * The element tree for one step: four hole panels (or none when the
 * selector matched nothing) plus the card near the target. Stateless, so
 * the whole panel contract -- buttons per step kind, skip/exit everywhere,
 * the missing path -- is asserted over `react.createElement` calls.
 */
export function TourOverlay(props: TourOverlayProps): unknown {
  const missing = props.rect === null;
  if (missing && props.dev) {
    // eslint-disable-next-line no-console
    console.error(
      `${PLUGIN_NAME}: selector "${props.step.target}" matched nothing (step "${props.step.id}"). ` +
        `A selector matching nothing is a defect, not a silent no-op: fix the selector.`,
    );
  }

  const hole = missing ? null : rectsForHole(props.viewport, props.rect as Rect);
  const card = placeCard(
    props.viewport,
    missing ? null : (props.rect as Rect),
    CARD_WIDTH,
    CARD_HEIGHT,
  );

  const holeElements =
    hole === null
      ? []
      : hole.map((rect, index) =>
          react.createElement("div", {
            key: `hole-${index}`,
            className: `${TOUR_CLASS}__hole`,
            style: {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            },
          }),
        );

  const detect = isDetectStep(props.step);
  const buttons: unknown[] = [];
  if (!detect) {
    buttons.push(
      react.createElement(
        "button",
        {
          key: "next",
          className: `${TOUR_CLASS}__btn ${TOUR_CLASS}__btn--primary`,
          onClick: () => props.onNext(props.step.id),
        },
        "Next",
      ),
    );
  }
  buttons.push(
    react.createElement(
      "button",
      {
        key: "skip",
        className: `${TOUR_CLASS}__btn`,
        onClick: () => props.onSkip(props.step.id),
      },
      "Skip this step",
    ),
  );
  buttons.push(
    react.createElement(
      "button",
      { key: "exit", className: `${TOUR_CLASS}__btn`, onClick: () => props.onExit() },
      "Exit tour",
    ),
  );

  const footnotes: unknown[] = [];
  if (detect) {
    footnotes.push(
      react.createElement(
        "p",
        { key: "waiting", className: `${TOUR_CLASS}__waiting` },
        `Waiting: ${describeCondition(props.step)}`,
      ),
    );
  }
  if (props.prefill !== null) {
    footnotes.push(
      react.createElement(
        "p",
        { key: "prefill", className: `${TOUR_CLASS}__prefill` },
        props.prefill.ok
          ? "The composer holds the next line -- review and send."
          : `Could not prefill the composer: ${props.prefill.detail}`,
      ),
    );
  }
  if (missing && props.dev) {
    footnotes.push(
      react.createElement(
        "p",
        { key: "missing", className: `${TOUR_CLASS}__waiting` },
        `Selector matched nothing (dev): ${props.step.target}`,
      ),
    );
  }

  const cardElement = react.createElement(
    "div",
    {
      className: `${TOUR_CLASS}__card` + (missing ? ` ${TOUR_CLASS}__missing` : ""),
      style: { left: card.x, top: card.y },
      role: "dialog",
      "aria-label": `Tour step ${props.position} of ${props.total}: ${props.step.id}`,
    },
    react.createElement(
      "div",
      { className: `${TOUR_CLASS}__meta` },
      `Step ${props.position} of ${props.total} · Chapter ${props.step.chapter}`,
    ),
    react.createElement("p", { className: `${TOUR_CLASS}__text` }, props.step.text),
    ...footnotes,
    react.createElement("div", { className: `${TOUR_CLASS}__actions` }, ...buttons),
  );

  return react.createElement("div", { className: TOUR_CLASS }, ...holeElements, cardElement);
}

export interface TourAppProps {
  /** Test/dev override for the loud missing-selector path. */
  readonly dev?: boolean;
}

/**
 * The live entry: tracks the target across scroll, resize and DOM moves,
 * scrolls it into view, attempts the prefill, and renders the overlay.
 * One observer and one handler -- the whole of the difference between four
 * rectangles and the cheap version, as the ticket counts it.
 */
export function TourApp(props?: TourAppProps): unknown {
  const dev = props?.dev ?? isDev();
  const controllerRef = react.useRef<TourController | null>(null);
  if (controllerRef.current === null) controllerRef.current = new TourController(STEPS);
  const controller = controllerRef.current;
  const [, setEpoch] = react.useState(0);
  const bump = (): void => setEpoch((epoch) => epoch + 1);
  const rectRef = react.useRef<Rect | null>(null);
  const [, setRectEpoch] = react.useState(0);
  const pokeRect = (): void => setRectEpoch((epoch) => epoch + 1);
  const warnedMissing = react.useRef<Set<string>>(new Set<string>());

  const step = controller.current();
  const stepId = step?.id ?? null;

  react.useEffect(() => {
    if (step === null || typeof document === "undefined") return undefined;
    const recompute = (): void => {
      const found = resolveTarget(document, step.target);
      rectRef.current = found;
      if (found === null) {
        if (dev) {
          // The error itself is logged by TourOverlay at render; here the
          // card still shows, without a spotlight, even in dev.
        } else if (!warnedMissing.current.has(step.id)) {
          warnedMissing.current.add(step.id);
          // eslint-disable-next-line no-console
          console.warn(
            `${PLUGIN_NAME}: selector "${step.target}" matched nothing; showing the card without a spotlight.`,
          );
        }
      } else if (!isRectVisible({ width: window.innerWidth, height: window.innerHeight }, found)) {
        try {
          document.querySelector(step.target)?.scrollIntoView({ block: "nearest" });
        } catch {
          /* scrolling is a courtesy; the card still shows */
        }
        const after = resolveTarget(document, step.target);
        rectRef.current = after;
      }
      pokeRect();
    };
    recompute();
    const onScrollOrResize = (): void => recompute();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    const Observer = (window as unknown as { MutationObserver?: typeof MutationObserver })
      .MutationObserver;
    const observer = typeof Observer === "function" ? new Observer(onScrollOrResize) : null;
    if (observer !== null && document.body !== null) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }
    // The prefill attempt: offered into an empty composer when a step that
    // carries one becomes current, and reported either way.
    if (step.prefill !== undefined && controller.prefillFor(step.id) === null) {
      const report = attemptPrefill({ doc: document, text: step.prefill });
      controller.notePrefill(step.id, report);
      notifyHost("tour/report-prefill", {
        stepId: step.id,
        ok: report.ok,
        method: report.method,
        detail: report.detail,
      });
      bump();
    }
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      observer?.disconnect();
    };
  }, [stepId]);

  if (step === null) return null;

  return TourOverlay({
    step,
    position: controller.position(),
    total: STEPS.length,
    rect: rectRef.current,
    viewport:
      typeof window === "undefined"
        ? { width: 1280, height: 800 }
        : { width: window.innerWidth, height: window.innerHeight },
    dev,
    prefill: controller.prefillFor(step.id),
    onNext: (id) => {
      controller.next(id);
      notifyHost("tour/step-action", { action: "next", stepId: id });
      bump();
    },
    onSkip: (id) => {
      controller.skip(id);
      notifyHost("tour/step-action", { action: "skip", stepId: id });
      bump();
    },
    onExit: () => {
      controller.exit();
      notifyHost("tour/step-action", { action: "exit" });
      bump();
    },
  });
}

/**
 * The slice of the Cordis context this plugin uses, typed structurally
 * like thursday-mark: the client half bundles `@deepseek-ai/*` external.
 */
export interface TourSlotsService {
  inject(slotName: string, callback: () => unknown): unknown;
  register(options: { name: string; id?: string }, component: unknown): () => void;
}

export interface TourContext {
  effect?: (setup: () => () => void) => unknown;
  on?: (event: string, listener: () => void) => unknown;
  slots: TourSlotsService;
}

/** The slice of Document `mount()` touches. Narrower than Document on purpose. */
export interface TourStyleDocument {
  querySelector(selector: string): { textContent: string } | null;
  createElement(tagName: string): {
    dataset: Record<string, string>;
    textContent: string;
  };
  head: { appendChild(child: { remove(): void }): void };
}

/**
 * Put the panel stylesheet into a document and return the function that
 * takes it out. Idempotent, like thursday-mark's mount.
 */
export function mount(doc: TourStyleDocument): () => void {
  const selector = 'style[data-plugin-css="' + STYLE_ID + '"]';
  const existing = doc.querySelector(selector) as unknown as { remove(): void } | null;

  let owned: { remove(): void } | null = null;
  if (existing === null) {
    const style = doc.createElement("style");
    style.dataset.plugin = PLUGIN_NAME;
    style.dataset.pluginCss = STYLE_ID;
    style.textContent = buildTourStylesheet();
    doc.head.appendChild(style as unknown as { remove(): void });
    owned = style as unknown as { remove(): void };
  }

  return () => {
    if (owned !== null) owned.remove();
  };
}

/**
 * Register the panel on the overlay seat, transactionally through inject
 * (a direct `register` into an undeclared slot throws -- thursday-mark's
 * rule, followed here). Exported so the tests drive it against a fake
 * slot registry.
 */
export function registerTourOverlay(ctx: TourContext): unknown {
  return ctx.slots.inject(OVERLAY_SLOT, () =>
    ctx.slots.register({ name: OVERLAY_SLOT, id: PLUGIN_NAME }, TourApp),
  );
}

/** Cordis entry point. */
export function apply(ctx: TourContext): void {
  // A host with no document (SSR, a test importing the module) is not an error.
  if (typeof document === "undefined") return;

  const start = (): (() => void) => {
    // The slot registration belongs to this plugin's fiber through the
    // inject controller, so it needs no manual teardown; the stylesheet is
    // raw DOM and does, which is what the returned remover owns.
    registerTourOverlay(ctx);
    return mount(document as unknown as TourStyleDocument);
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
      ": this host provides neither ctx.effect nor ctx.on, so the panel " +
      "stylesheet cannot register its own teardown and will survive unload.",
  );
}

/** Cordis service dependencies. The panel needs the slot registry: nothing else. */
export const inject: string[] = ["slots"];

/** The plugin name Cordis displays. */
export const name = PLUGIN_NAME;
