/**
 * The plugin's own behaviour: what it puts in the document, and that taking it
 * away leaves nothing behind.
 *
 * There is no jsdom or happy-dom in this workspace, and adding a dependency to
 * test six DOM calls is a poor trade, so this file carries a stub that models
 * exactly the surface `mount()` touches and nothing else. It is deliberately
 * small enough to read: if `mount()` starts using something the stub does not
 * have, the test fails with a TypeError rather than passing vacuously.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { apply, inject, mount, name } from "../src/client";
import { PLUGIN_NAME, SCOPE_ATTRIBUTE, STYLE_ID } from "../src/scope";
import { buildStylesheet } from "../src/stylesheet";

interface StubElement {
  tagName: string;
  dataset: Record<string, string>;
  textContent: string;
  attributes: Map<string, string>;
  parent: StubElement | null;
  children: StubElement[];
  setAttribute(qualifiedName: string, value: string): void;
  removeAttribute(qualifiedName: string): void;
  hasAttribute(qualifiedName: string): boolean;
  appendChild(child: StubElement): void;
  remove(): void;
}

/** The order in which a mount or unmount touched the document. */
let trace: string[] = [];

function element(tagName: string): StubElement {
  const self: StubElement = {
    tagName,
    dataset: {},
    textContent: "",
    attributes: new Map(),
    parent: null,
    children: [],
    setAttribute(qualifiedName, value) {
      trace.push(`set:${qualifiedName}`);
      self.attributes.set(qualifiedName, value);
    },
    removeAttribute(qualifiedName) {
      trace.push(`unset:${qualifiedName}`);
      self.attributes.delete(qualifiedName);
    },
    hasAttribute: (qualifiedName) => self.attributes.has(qualifiedName),
    appendChild(child) {
      trace.push(`append:${child.tagName}`);
      child.parent = self;
      self.children.push(child);
    },
    remove() {
      trace.push(`remove:${self.tagName}`);
      const siblings = self.parent?.children;
      if (siblings) siblings.splice(siblings.indexOf(self), 1);
      self.parent = null;
    },
  };
  return self;
}

function stubDocument() {
  const head = element("head");
  const body = element("body");
  const doc = {
    head,
    body,
    createElement: (tagName: string) => element(tagName),
    /** Only ever asked for `style[data-plugin-css="..."]`, so only that is parsed. */
    querySelector(selector: string) {
      const wanted = /data-plugin-css="([^"]+)"/.exec(selector)?.[1];
      return head.children.find((child) => child.dataset.pluginCss === wanted) ?? null;
    },
  };
  return { doc: doc as unknown as Document, head, body };
}

/** The style elements this skin owns, in a stub document. */
const styles = (head: StubElement): StubElement[] =>
  head.children.filter((child) => child.dataset.pluginCss === STYLE_ID);

afterEach(() => {
  trace = [];
  delete (globalThis as { document?: unknown }).document;
  vi.restoreAllMocks();
});

describe("the plugin's Cordis surface", () => {
  it("exports apply, inject and name", () => {
    expect(typeof apply).toBe("function");
    expect(Array.isArray(inject)).toBe(true);
    expect(typeof name).toBe("string");
  });

  it("is named thursday-skin", () => {
    expect(name).toBe(PLUGIN_NAME);
    expect(name).toBe("thursday-skin");
  });

  it("declares no service dependencies: it needs a document and nothing else", () => {
    expect(inject).toEqual([]);
  });
});

describe("mounting", () => {
  it("injects exactly one stylesheet, marked as this plugin's", () => {
    const { doc, head } = stubDocument();
    mount(doc);
    expect(styles(head)).toHaveLength(1);
    const style = styles(head)[0] as StubElement;
    expect(style.tagName).toBe("style");
    expect(style.dataset.plugin).toBe(PLUGIN_NAME);
    expect(style.textContent).toBe(buildStylesheet());
  });

  it("puts the scope attribute on the body, which is what makes the CSS match", () => {
    const { doc, body } = stubDocument();
    mount(doc);
    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(true);
  });

  it("is idempotent: a second mount reuses the stylesheet rather than stacking one", () => {
    const { doc, head } = stubDocument();
    mount(doc);
    mount(doc);
    expect(styles(head)).toHaveLength(1);
  });

  it("does not let a second mount's teardown remove the first mount's stylesheet", () => {
    const { doc, head, body } = stubDocument();
    const first = mount(doc);
    const second = mount(doc);
    second();
    expect(styles(head), "the second mount did not own the element").toHaveLength(1);
    first();
    expect(styles(head)).toHaveLength(0);
    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false);
  });
});

describe("criterion: uninstall removes the skin with no residue", () => {
  it("removes both the attribute and the stylesheet", () => {
    const { doc, head, body } = stubDocument();
    const unmount = mount(doc);
    unmount();
    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false);
    expect(styles(head)).toHaveLength(0);
    expect(head.children).toHaveLength(0);
  });

  /**
   * Order is the whole point. Dropping the attribute unskins the page
   * instantly; detaching the stylesheet first would leave a frame in which the
   * scope still matched but the rules were gone -- a flash of unstyled dsh.
   */
  it("drops the attribute before it detaches the stylesheet", () => {
    const { doc } = stubDocument();
    const unmount = mount(doc);
    trace = [];
    unmount();
    expect(trace).toEqual([`unset:${SCOPE_ATTRIBUTE}`, "remove:style"]);
  });

  it("leaves the body with no attribute of its own to clean up", () => {
    const { doc, body } = stubDocument();
    mount(doc)();
    expect([...body.attributes.keys()]).toEqual([]);
  });
});

describe("teardown is registered with the host", () => {
  it("uses ctx.effect when the host has one", () => {
    const { doc, body } = stubDocument();
    (globalThis as { document?: unknown }).document = doc;

    let teardown: (() => void) | undefined;
    apply({
      effect: (setup) => {
        teardown = setup();
        return undefined;
      },
    });

    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(true);
    expect(typeof teardown).toBe("function");
    teardown?.();
    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false);
  });

  it("falls back to ctx.on('dispose') on a host with no effect", () => {
    const { doc, body } = stubDocument();
    (globalThis as { document?: unknown }).document = doc;

    const listeners: Record<string, () => void> = {};
    apply({
      on: (event, listener) => {
        listeners[event] = listener;
        return undefined;
      },
    });

    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(true);
    listeners.dispose?.();
    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false);
  });

  it("warns rather than pretending, on a host that offers neither", () => {
    const { doc, body } = stubDocument();
    (globalThis as { document?: unknown }).document = doc;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    apply({});

    expect(body.hasAttribute(SCOPE_ATTRIBUTE)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(SCOPE_ATTRIBUTE);
  });

  it("does nothing at all where there is no document", () => {
    expect(() => apply({})).not.toThrow();
  });
});
