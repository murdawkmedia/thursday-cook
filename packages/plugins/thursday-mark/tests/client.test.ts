/**
 * The client half's behaviour: what it puts in the document, which slots it
 * takes (and which it leaves), and that taking it away leaves nothing behind.
 *
 * There is no jsdom or happy-dom in this workspace, and adding a dependency to
 * test a dozen DOM calls is a poor trade -- thursday-skin and
 * thursday-thinking made the same call -- so this file carries stubs that
 * model exactly the surfaces the client touches and nothing else. Each stub
 * is deliberately small enough to read: if the client starts using something
 * a stub does not have, the test fails with a TypeError rather than passing
 * vacuously.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MARK_SLOTS,
  STYLE_ID,
  ThursdayMark,
  apply,
  inject,
  mount,
  name,
  registerMarkSlots,
} from "../src/client";
import type { MarkContext } from "../src/client";
import { MARK_CLASS, MARK_DEFAULT_SIZE, MARK_SVG, PLUGIN_NAME } from "../src/mark";

// --- the react stub --------------------------------------------------------
// dsh injects `react` as a lowercase global in the browser bundle; here it is
// a recorder behind the same name.

interface CreatedElement {
  type: string;
  props: Record<string, unknown>;
}

let created: CreatedElement[] = [];

function installReactStub(): void {
  (globalThis as unknown as { react: unknown }).react = {
    createElement: (type: string, props: Record<string, unknown> | null) => {
      const element: CreatedElement = { type, props: props ?? {} };
      created.push(element);
      return element;
    },
  };
}

function uninstallReactStub(): void {
  delete (globalThis as unknown as { react?: unknown }).react;
}

// --- the document stub -----------------------------------------------------

interface StubStyle {
  dataset: Record<string, string>;
  textContent: string;
  removed: boolean;
  remove(): void;
}

interface StubDocument {
  styles: StubStyle[];
  querySelector(selector: string): { textContent: string } | null;
  createElement(tagName: string): StubStyle;
  head: { appendChild(child: StubStyle): void };
}

function stubDocument(): StubDocument {
  const doc: StubDocument = {
    styles: [],
    querySelector: (selector: string) => {
      const found = doc.styles.find(
        (style) => 'style[data-plugin-css="' + style.dataset.pluginCss + '"]' === selector,
      );
      return found ?? null;
    },
    createElement: (_tagName: string) => {
      const style: StubStyle = {
        dataset: {},
        textContent: "",
        removed: false,
        remove() {
          style.removed = true;
          doc.styles.splice(doc.styles.indexOf(style), 1);
        },
      };
      return style;
    },
    head: {
      appendChild: (child: StubStyle) => {
        doc.styles.push(child);
      },
    },
  };
  return doc;
}

// --- the slots stub --------------------------------------------------------

interface RegisteredSlot {
  name: string;
  component: unknown;
}

function stubSlots() {
  const state = {
    injected: [] as string[],
    registered: [] as RegisteredSlot[],
  };
  const slots = {
    inject(slotName: string, callback: () => unknown): unknown {
      state.injected.push(slotName);
      const result = callback();
      // dsh runs a yielded generator as one registration transaction: each
      // yield installs, setup failure rolls earlier yields back. The stub
      // exhausts it for the same effect -- without this the registrations
      // below would silently never happen and the test would pass vacuously.
      if (
        typeof result === "object" &&
        result !== null &&
        Symbol.iterator in result
      ) {
        for (const _yielded of result as Iterable<unknown>) void _yielded;
      }
      return result;
    },
    register(options: { name: string }, component: unknown): () => void {
      state.registered.push({ name: options.name, component });
      let stopped = false;
      return () => {
        stopped = true;
        void stopped;
      };
    },
  };
  return { state, slots };
}

afterEach(() => {
  created = [];
  uninstallReactStub();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("plugin identity", () => {
  it("is named thursday-mark and declares the slots service", () => {
    expect(name).toBe(PLUGIN_NAME);
    expect(inject).toEqual(["slots"]);
  });

  it("takes the two mark slots and leaves the wordmark slot alone", () => {
    expect([...MARK_SLOTS]).toEqual(["sidebar.brand.mark", "conversation.hero.brand.mark"]);
    expect(MARK_SLOTS).not.toContain("sidebar.brand.name");
  });
});

describe("ThursdayMark", () => {
  it("renders a span carrying the mark markup, hidden from assistive tech", () => {
    installReactStub();
    const element = ThursdayMark({}) as CreatedElement;
    expect(element.type).toBe("span");
    expect((element.props.dangerouslySetInnerHTML as { __html: string }).__html).toBe(MARK_SVG);
    expect(element.props["aria-hidden"]).toBe("true");
  });

  it("sizes to the slot's request, defaulting to the square fallback", () => {
    installReactStub();
    const sized = ThursdayMark({ size: 32 }) as CreatedElement;
    expect(sized.props.style).toEqual({ width: 32, height: 32 });
    const fallback = ThursdayMark({}) as CreatedElement;
    expect(fallback.props.style).toEqual({ width: MARK_DEFAULT_SIZE, height: MARK_DEFAULT_SIZE });
  });

  it("merges the host class after its own", () => {
    installReactStub();
    const plain = ThursdayMark({}) as CreatedElement;
    expect(plain.props.className).toBe(MARK_CLASS);
    const merged = ThursdayMark({ className: "host-size" }) as CreatedElement;
    expect(merged.props.className).toBe(MARK_CLASS + " host-size");
  });
});

describe("mount", () => {
  it("installs the generated stylesheet once, marked as this plugin's", () => {
    const doc = stubDocument();
    const stop = mount(doc as unknown as Parameters<typeof mount>[0]);
    expect(doc.styles.length).toBe(1);
    expect(doc.styles[0]?.dataset.plugin).toBe(PLUGIN_NAME);
    expect(doc.styles[0]?.dataset.pluginCss).toBe(STYLE_ID);
    expect(doc.styles[0]?.textContent).toContain("th-mark-to-orange 14s");
    stop();
  });

  it("is idempotent: a second mount reuses the element, and only the owner removes", () => {
    const doc = stubDocument();
    const stopFirst = mount(doc as unknown as Parameters<typeof mount>[0]);
    const stopSecond = mount(doc as unknown as Parameters<typeof mount>[0]);
    expect(doc.styles.length).toBe(1);
    stopSecond();
    expect(doc.styles.length).toBe(1);
    stopFirst();
    expect(doc.styles.length).toBe(0);
  });
});

describe("registerMarkSlots", () => {
  it("registers ThursdayMark on both mark slots through nested injects", () => {
    const { state, slots } = stubSlots();
    registerMarkSlots({ slots } as MarkContext);
    expect(state.injected).toEqual(["sidebar.brand.mark", "conversation.hero.brand.mark"]);
    expect(state.registered.map((entry) => entry.name)).toEqual([
      "sidebar.brand.mark",
      "conversation.hero.brand.mark",
    ]);
    for (const entry of state.registered) {
      expect(entry.component).toBe(ThursdayMark);
    }
  });

  it("never touches the wordmark slot", () => {
    const { state, slots } = stubSlots();
    registerMarkSlots({ slots } as MarkContext);
    expect(state.injected).not.toContain("sidebar.brand.name");
    expect(state.registered.map((entry) => entry.name)).not.toContain("sidebar.brand.name");
  });
});

describe("apply", () => {
  it("hands teardown to ctx.effect when the host offers it", () => {
    const { slots } = stubSlots();
    const setups: Array<() => () => void> = [];
    const doc = stubDocument();
    vi.stubGlobal("document", doc);
    const ctx = {
      slots,
      effect: (setup: () => () => void) => {
        setups.push(setup);
        return undefined;
      },
    } as unknown as MarkContext;
    apply(ctx);
    expect(setups.length).toBe(1);
    const stop = (setups[0] as () => () => void)();
    expect(doc.styles.length).toBe(1);
    stop();
    expect(doc.styles.length).toBe(0);
  });

  it("falls back to the dispose event when effect is absent", () => {
    const { slots } = stubSlots();
    const listeners = new Map<string, () => void>();
    const doc = stubDocument();
    vi.stubGlobal("document", doc);
    const ctx = {
      slots,
      on: (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    } as unknown as MarkContext;
    apply(ctx);
    expect(doc.styles.length).toBe(1);
    (listeners.get("dispose") as () => void)();
    expect(doc.styles.length).toBe(0);
  });

  it("still applies, with a warning, when the host offers neither", () => {
    const { slots } = stubSlots();
    const doc = stubDocument();
    vi.stubGlobal("document", doc);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    apply({ slots } as MarkContext);
    expect(doc.styles.length).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(PLUGIN_NAME);
  });
});
