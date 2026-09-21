/**
 * The client half: the overlay seat, the step tree, and the missing path.
 *
 * No jsdom or happy-dom in this workspace -- thursday-mark made the same
 * call -- so this file carries stubs modelling exactly the surfaces the
 * client touches. Each stub is deliberately small: if the client starts
 * using something a stub does not have, the test fails with a TypeError
 * rather than passing vacuously.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OVERLAY_SLOT,
  PLUGIN_NAME,
  STYLE_ID,
  TourController,
  TourOverlay,
  apply,
  hostFacade,
  inject,
  isDev,
  mount,
  name,
  notifyHost,
  registerTourOverlay,
  resolveTarget,
} from "../src/client";
import type { TourContext } from "../src/client";
import { STEPS } from "../src/steps.generated";
import type { TourStep } from "../src/steps";
import { TOUR_CLASS } from "../src/stylesheet";

// --- the react stub --------------------------------------------------------
// dsh injects `react` as a lowercase global in the browser bundle; here it
// is a recorder behind the same name. TourOverlay is stateless, so only
// createElement is exercised; hooks exist so importing the module never
// sees an absent global.

interface CreatedElement {
  type: string;
  props: Record<string, unknown>;
  children: unknown[];
}

let created: CreatedElement[] = [];

function installReactStub(): void {
  (globalThis as unknown as { react: unknown }).react = {
    createElement: (
      type: string,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => {
      const element: CreatedElement = { type, props: props ?? {}, children };
      created.push(element);
      return element;
    },
    useState: (initial: unknown) => [initial, () => undefined],
    useEffect: () => undefined,
    useRef: (initial: unknown) => ({ current: initial }),
  };
}

function uninstallReactStub(): void {
  delete (globalThis as unknown as { react?: unknown }).react;
}

function buttons(): string[] {
  return created
    .filter((element) => element.type === "button")
    .map((element) => element.children[0] as string);
}

function paragraphs(): CreatedElement[] {
  return created.filter((element) => element.type === "p");
}

function holes(): CreatedElement[] {
  return created.filter(
    (element) =>
      element.type === "div" &&
      String((element.props.className as string) ?? "").includes("__hole"),
  );
}

function card(): CreatedElement | undefined {
  return created.find(
    (element) =>
      element.type === "div" &&
      String((element.props.className as string) ?? "").includes("__card"),
  );
}

// --- the document stub -----------------------------------------------------

function stubDocument() {
  const state = {
    styles: [] as Array<{
      dataset: Record<string, string>;
      textContent: string;
      removed: boolean;
      remove(): void;
    }>,
    targets: new Map<string, { x: number; y: number; width: number; height: number }>(),
  };
  const doc = {
    querySelector: (selector: string) => {
      if (selector.startsWith("style")) {
        const found = state.styles.find(
          (style) => 'style[data-plugin-css="' + style.dataset.pluginCss + '"]' === selector,
        );
        return (found ?? null) as unknown as null;
      }
      const rect = state.targets.get(selector);
      if (rect === undefined) return null;
      return { getBoundingClientRect: () => ({ ...rect }) };
    },
    createElement: (_tagName: string) => {
      const style = {
        dataset: {} as Record<string, string>,
        textContent: "",
        removed: false,
        remove() {
          style.removed = true;
          state.styles.splice(state.styles.indexOf(style), 1);
        },
      };
      return style;
    },
    head: {
      appendChild: (child: (typeof state.styles)[number]) => void state.styles.push(child),
    },
  };
  return { state, doc };
}

// --- the slots stub --------------------------------------------------------

function stubSlots() {
  const state = {
    injected: [] as string[],
    registered: [] as Array<{ name: string; options: unknown; component: unknown }>,
  };
  const slots = {
    inject(slotName: string, callback: () => unknown): unknown {
      state.injected.push(slotName);
      return callback();
    },
    register(options: { name: string; id?: string }, component: unknown): () => void {
      state.registered.push({ name: options.name, options, component });
      return () => undefined;
    },
  };
  return { state, slots };
}

function step(id: string): TourStep {
  const found = STEPS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`test bug: no step ${id}`);
  return found;
}

afterEach(() => {
  created = [];
  uninstallReactStub();
  delete (globalThis as { host?: unknown }).host;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("plugin identity", () => {
  it("is named thursday-tour and declares the slots service", () => {
    expect(name).toBe(PLUGIN_NAME);
    expect(inject).toEqual(["slots"]);
  });

  it("takes the overlay seat, never the render-tree root", () => {
    expect(OVERLAY_SLOT).toBe("shell.overlay");
    const { state, slots } = stubSlots();
    registerTourOverlay({ slots } as TourContext);
    expect(state.injected).toEqual(["shell.overlay"]);
    expect(state.registered.map((entry) => entry.name)).toEqual(["shell.overlay"]);
    expect(state.injected).not.toContain("root");
    expect(state.registered.map((entry) => entry.name)).not.toContain("root");
  });
});

describe("isDev and resolveTarget", () => {
  it("is loud unless production is explicit", () => {
    expect(isDev({ env: "production" })).toBe(false);
    expect(isDev({ env: "test" })).toBe(true);
  });

  it("maps one querySelector to one rect, and missing to null", () => {
    const { state, doc } = stubDocument();
    state.targets.set("[data-composer-seat]", { x: 10, y: 20, width: 300, height: 60 });
    expect(resolveTarget(doc, "[data-composer-seat]")).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 60,
    });
    expect(resolveTarget(doc, "[data-missing]")).toBeNull();
    expect(
      resolveTarget(
        {
          querySelector: () => {
            throw new Error("bad selector");
          },
        },
        "??",
      ),
    ).toBeNull();
  });
});

describe("TourController", () => {
  it("opens on the first step and walks manual steps", () => {
    const controller = new TourController(STEPS);
    expect(controller.current()?.id).toBe("see-blog");
    expect(controller.position()).toBe(1);
    controller.next("see-blog");
    expect(controller.current()?.id).toBe("state-intent");
  });

  it("refuses Next on a detect step: detection moves those, never a button", () => {
    const controller = new TourController(STEPS);
    expect(() => controller.next("verify-t1")).toThrow(/detection, not by Next/);
    expect(() => controller.next("nope")).toThrow(/unknown step/);
  });

  it("skips and exits from anywhere", () => {
    const controller = new TourController(STEPS);
    controller.skip("see-blog");
    expect(controller.current()?.id).toBe("state-intent");
    controller.exit();
    expect(controller.current()).toBeNull();
    expect(controller.isExited()).toBe(true);
  });
});

describe("TourOverlay", () => {
  const viewport = { width: 1280, height: 800 };
  const rect = { x: 100, y: 100, width: 200, height: 60 };
  const noop = () => undefined;

  it("a manual step carries Next, Skip and Exit", () => {
    installReactStub();
    TourOverlay({
      step: step("see-blog"),
      position: 1,
      total: 10,
      rect,
      viewport,
      dev: true,
      prefill: null,
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(buttons()).toEqual(["Next", "Skip this step", "Exit tour"]);
    expect(holes().length).toBe(4);
    expect(card()).toBeDefined();
  });

  it("a detect step carries NO Next -- only Skip, Exit and the waiting line", () => {
    installReactStub();
    TourOverlay({
      step: step("verify-t1"),
      position: 4,
      total: 10,
      rect,
      viewport,
      dev: true,
      prefill: null,
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(buttons()).toEqual(["Skip this step", "Exit tour"]);
    expect(paragraphs().some((p) => String(p.children[0]).startsWith("Waiting:"))).toBe(true);
  });

  it("every shipped step renders skip and exit, with or without Next", () => {
    installReactStub();
    for (const candidate of STEPS) {
      created = [];
      TourOverlay({
        step: candidate,
        position: 1,
        total: 10,
        rect,
        viewport,
        dev: true,
        prefill: null,
        onNext: noop,
        onSkip: noop,
        onExit: noop,
      });
      expect(buttons(), candidate.id).toContain("Skip this step");
      expect(buttons(), candidate.id).toContain("Exit tour");
    }
  });

  it("a missing selector is loud in dev: error plus marked card, no hole", () => {
    installReactStub();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    TourOverlay({
      step: step("see-blog"),
      position: 1,
      total: 10,
      rect: null,
      viewport,
      dev: true,
      prefill: null,
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toContain("[data-composer-seat]");
    expect(holes().length).toBe(0);
    expect(String(card()?.props.className)).toContain(`${TOUR_CLASS}__missing`);
  });

  it("a missing selector in prod shows the card without a spotlight and stays quiet", () => {
    installReactStub();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    TourOverlay({
      step: step("see-blog"),
      position: 1,
      total: 10,
      rect: null,
      viewport,
      dev: false,
      prefill: null,
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(error).not.toHaveBeenCalled();
    expect(holes().length).toBe(0);
    expect(card()).toBeDefined();
    expect(buttons()).toContain("Exit tour");
  });

  it("reports the prefill outcome in the card either way", () => {
    installReactStub();
    TourOverlay({
      step: step("state-intent"),
      position: 2,
      total: 10,
      rect,
      viewport,
      dev: true,
      prefill: { ok: true, method: "composer-dom", detail: "set" },
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(paragraphs().some((p) => String(p.children[0]).includes("composer holds"))).toBe(true);

    created = [];
    TourOverlay({
      step: step("state-intent"),
      position: 2,
      total: 10,
      rect,
      viewport,
      dev: true,
      prefill: { ok: false, method: "none", detail: "no composer editable found" },
      onNext: noop,
      onSkip: noop,
      onExit: noop,
    });
    expect(
      paragraphs().some((p) => String(p.children[0]).includes("no composer editable found")),
    ).toBe(true);
  });
});

describe("notifyHost", () => {
  it("is a silent no-op with no transport, and calls through when one exists", () => {
    expect(hostFacade()).toBeNull();
    expect(() => notifyHost("tour/step-action", { action: "exit" })).not.toThrow();

    const calls: Array<{ method: string; args: unknown }> = [];
    (globalThis as { host?: unknown }).host = {
      call: (method: string, args: unknown) => {
        calls.push({ method, args });
        return Promise.resolve(null);
      },
    };
    expect(hostFacade()).not.toBeNull();
    notifyHost("tour/step-action", { action: "exit" });
    expect(calls).toEqual([{ method: "tour/step-action", args: { action: "exit" } }]);
  });
});

describe("mount", () => {
  it("installs the generated stylesheet once, marked as this plugin's", () => {
    const { state, doc } = stubDocument();
    const stop = mount(doc as unknown as Parameters<typeof mount>[0]);
    expect(state.styles.length).toBe(1);
    expect(state.styles[0]?.dataset.plugin).toBe(PLUGIN_NAME);
    expect(state.styles[0]?.dataset.pluginCss).toBe(STYLE_ID);
    expect(state.styles[0]?.textContent).toContain(TOUR_CLASS);
    stop();
  });

  it("is idempotent: a second mount reuses the element, and only the owner removes", () => {
    const { state, doc } = stubDocument();
    const stopFirst = mount(doc as unknown as Parameters<typeof mount>[0]);
    const stopSecond = mount(doc as unknown as Parameters<typeof mount>[0]);
    expect(state.styles.length).toBe(1);
    stopSecond();
    expect(state.styles.length).toBe(1);
    stopFirst();
    expect(state.styles.length).toBe(0);
  });
});

describe("apply", () => {
  it("hands teardown to ctx.effect when the host offers it", () => {
    const { slots } = stubSlots();
    const setups: Array<() => () => void> = [];
    const { state, doc } = stubDocument();
    vi.stubGlobal("document", doc);
    const ctx = {
      slots,
      effect: (setup: () => () => void) => {
        setups.push(setup);
        return undefined;
      },
    } as unknown as TourContext;
    apply(ctx);
    expect(setups.length).toBe(1);
    const stop = (setups[0] as () => () => void)();
    expect(state.styles.length).toBe(1);
    stop();
    expect(state.styles.length).toBe(0);
  });

  it("falls back to the dispose event when effect is absent", () => {
    const { slots } = stubSlots();
    const listeners = new Map<string, () => void>();
    const { state, doc } = stubDocument();
    vi.stubGlobal("document", doc);
    const ctx = {
      slots,
      on: (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    } as unknown as TourContext;
    apply(ctx);
    expect(state.styles.length).toBe(1);
    (listeners.get("dispose") as () => void)();
    expect(state.styles.length).toBe(0);
  });

  it("still applies, with a warning, when the host offers neither", () => {
    const { slots } = stubSlots();
    const { state, doc } = stubDocument();
    vi.stubGlobal("document", doc);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    apply({ slots } as TourContext);
    expect(state.styles.length).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(PLUGIN_NAME);
  });
});
