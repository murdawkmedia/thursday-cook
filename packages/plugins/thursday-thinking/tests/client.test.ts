/**
 * The plugin's own behaviour: what it puts in the document, that it survives
 * React putting "Deep diving..." back, and that taking it away leaves nothing
 * behind.
 *
 * There is no jsdom or happy-dom in this workspace, and adding a dependency to
 * test a dozen DOM calls is a poor trade -- thursday-skin made the same call --
 * so this file carries a stub that models exactly the surface `mount()`
 * touches and nothing else. It is deliberately small enough to read: if
 * `mount()` starts using something the stub does not have, the test fails with
 * a TypeError rather than passing vacuously.
 *
 * THE STUB'S HOST IS SHAPED LIKE THE REAL ONE. dsh renders
 *
 *     <div class="Md3f7G_turnStatus" role="status" aria-live="polite">
 *       "Deep diving..."
 *       <span class="Md3f7G_turnStatusClock" aria-hidden>0:21</span>
 *     </div>
 *
 * -- a bare text node followed, after fifteen seconds, by a clock span. The
 * fixture below is that, hash and all, because the two interesting bugs live
 * exactly there: blanking the wrong node eats the clock, and a selector that
 * does not exclude `turnStatusClock` grabs the child instead of the parent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { INDICATOR_CLASS, PHRASE_CLASS } from "../src/indicator";
import { PHRASES, ROTATION } from "../src/phrases";
import { HOST_SELECTOR, PLUGIN_NAME, apply, inject, mount, name } from "../src/client";

// --- the stub ------------------------------------------------------------

interface StubNode {
  nodeType: number;
  nodeValue: string | null;
  parent: StubElement | null;
  remove(): void;
}

interface StubElement extends StubNode {
  tagName: string;
  className: string;
  dataset: Record<string, string>;
  textContent: string;
  innerHTML: string;
  childNodes: StubNode[];
  appendChild(child: StubNode): void;
}

function text(value: string): StubNode {
  const node: StubNode = {
    nodeType: 3,
    nodeValue: value,
    parent: null,
    remove() {
      const siblings = node.parent?.childNodes;
      if (siblings) siblings.splice(siblings.indexOf(node), 1);
      node.parent = null;
    },
  };
  return node;
}

function element(tagName: string): StubElement {
  const self: StubElement = {
    nodeType: 1,
    nodeValue: null,
    tagName,
    className: "",
    dataset: {},
    textContent: "",
    innerHTML: "",
    childNodes: [],
    parent: null,
    appendChild(child) {
      child.parent = self;
      self.childNodes.push(child);
    },
    remove() {
      const siblings = self.parent?.childNodes;
      if (siblings) siblings.splice(siblings.indexOf(self), 1);
      self.parent = null;
    },
  };
  return self;
}

/** dsh's turn-status element, as the real bundle renders it. */
function turnStatus(withClock: boolean): StubElement {
  const host = element("div");
  host.className = "Md3f7G_turnStatus";
  host.appendChild(text("Deep diving..."));
  if (withClock) {
    const clock = element("span");
    clock.className = "Md3f7G_turnStatusClock";
    clock.appendChild(text("0:21"));
    host.appendChild(clock);
  }
  return host;
}

interface Stub {
  doc: Document;
  head: StubElement;
  body: StubElement;
  host: StubElement | null;
  setHost(host: StubElement | null): void;
  fireObservers(): void;
  tick(): void;
  intervals: Array<{ handler: () => void; ms: number; cleared: boolean }>;
}

function stubDocument(host: StubElement | null): Stub {
  const head = element("head");
  const body = element("body");
  let current = host;
  const observers: Array<() => void> = [];
  const intervals: Stub["intervals"] = [];

  const view = {
    setInterval(handler: () => void, ms: number) {
      intervals.push({ handler, ms, cleared: false });
      return intervals.length - 1;
    },
    clearInterval(handle: unknown) {
      const entry = intervals[handle as number];
      if (entry) entry.cleared = true;
    },
    MutationObserver: class {
      constructor(private readonly callback: () => void) {}
      observe() {
        observers.push(() => this.callback());
      }
      disconnect() {
        const index = observers.findIndex((fn) => fn === this.callback);
        if (index >= 0) observers.splice(index, 1);
      }
    },
  };

  const doc = {
    head,
    body,
    defaultView: view,
    createElement: (tagName: string) => element(tagName),
    querySelector(selector: string) {
      if (selector === HOST_SELECTOR) return current;
      const wanted = /data-plugin-css="([^"]+)"/.exec(selector)?.[1];
      if (wanted !== undefined) {
        return (
          head.childNodes.find((c) => (c as StubElement).dataset?.pluginCss === wanted) ?? null
        );
      }
      return null;
    },
  };

  return {
    doc: doc as unknown as Document,
    head,
    body,
    get host() {
      return current;
    },
    setHost(next) {
      current = next;
    },
    fireObservers: () => observers.slice().forEach((fn) => fn()),
    tick: () => intervals.filter((i) => !i.cleared).forEach((i) => i.handler()),
    intervals,
  };
}

const styles = (head: StubElement) =>
  head.childNodes.filter((c) => (c as StubElement).dataset?.pluginCss === PLUGIN_NAME);

const indicatorIn = (host: StubElement) =>
  host.childNodes.filter((c) => (c as StubElement).className === INDICATOR_CLASS);

const phraseOf = (host: StubElement): string => {
  const indicator = indicatorIn(host)[0] as StubElement | undefined;
  const span = indicator?.childNodes.find((c) => (c as StubElement).className === PHRASE_CLASS);
  return (span as StubElement | undefined)?.textContent ?? "";
};

const ownText = (host: StubElement): string =>
  host.childNodes
    .filter((c) => c.nodeType === 3)
    .map((c) => c.nodeValue ?? "")
    .join("");

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  vi.restoreAllMocks();
});

describe("the plugin's Cordis surface", () => {
  it("exports apply, inject and name", () => {
    expect(typeof apply).toBe("function");
    expect(Array.isArray(inject)).toBe(true);
    expect(name).toBe("thursday-thinking");
  });

  it("declares no service dependencies: it needs a document and nothing else", () => {
    expect(inject).toEqual([]);
  });
});

describe("taking over dsh's turn status", () => {
  it("injects exactly one stylesheet, marked as this plugin's", () => {
    const stub = stubDocument(turnStatus(false));
    mount({ document: stub.doc });
    expect(styles(stub.head)).toHaveLength(1);
    expect((styles(stub.head)[0] as StubElement).textContent).toContain("prefers-reduced-motion");
  });

  it("empties dsh's own text so 'Deep diving...' is gone", () => {
    const host = turnStatus(false);
    mount({ document: stubDocument(host).doc });
    expect(ownText(host)).toBe("");
  });

  it("leaves the elapsed clock alone: it is a child span, not our text", () => {
    const host = turnStatus(true);
    mount({ document: stubDocument(host).doc });
    const clock = host.childNodes.find(
      (c) => (c as StubElement).className === "Md3f7G_turnStatusClock",
    ) as StubElement;
    expect(clock.childNodes[0]?.nodeValue).toBe("0:21");
  });

  it("adds the indicator with a phrase from the set", () => {
    const host = turnStatus(false);
    mount({ document: stubDocument(host).doc });
    expect(indicatorIn(host)).toHaveLength(1);
    expect(PHRASES).toContain(phraseOf(host));
  });

  it("does nothing but the stylesheet when dsh is not showing a status", () => {
    const stub = stubDocument(null);
    expect(() => mount({ document: stub.doc })).not.toThrow();
    expect(styles(stub.head)).toHaveLength(1);
  });

  it("is idempotent on the stylesheet: a second mount does not stack one", () => {
    const stub = stubDocument(turnStatus(false));
    mount({ document: stub.doc });
    mount({ document: stub.doc });
    expect(styles(stub.head)).toHaveLength(1);
  });
});

describe("surviving React", () => {
  it("re-blanks the text when React puts 'Deep diving...' back", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    mount({ document: stub.doc });
    expect(ownText(host)).toBe("");

    // React re-renders every second once the clock appears.
    host.childNodes[0]!.nodeValue = "Deep diving...";
    stub.fireObservers();

    expect(ownText(host)).toBe("");
    expect(indicatorIn(host)).toHaveLength(1);
  });

  it("does not restart the phrase cycle on every re-render", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    const mounted = mount({ document: stub.doc });
    const shown = phraseOf(host);
    for (let index = 0; index < 20; index += 1) {
      host.childNodes[0]!.nodeValue = "Deep diving...";
      stub.fireObservers();
    }
    expect(phraseOf(host)).toBe(shown);
    expect(mounted.current()).toBe(shown);
  });

  it("re-attaches the indicator if React tore the subtree down and rebuilt it", () => {
    const stub = stubDocument(turnStatus(false));
    mount({ document: stub.doc });
    const rebuilt = turnStatus(true);
    stub.setHost(rebuilt);
    stub.fireObservers();
    expect(indicatorIn(rebuilt)).toHaveLength(1);
    expect(ownText(rebuilt)).toBe("");
  });

  it("puts the text back when dsh's status disappears mid-run", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    mount({ document: stub.doc });
    stub.setHost(null);
    stub.fireObservers();
    expect(ownText(host)).toBe("Deep diving...");
    expect(indicatorIn(host)).toHaveLength(0);
  });
});

describe("the rotation is driven by a timer the plugin owns", () => {
  it("registers one interval, at the interval from the data file", () => {
    const stub = stubDocument(turnStatus(false));
    mount({ document: stub.doc });
    expect(stub.intervals).toHaveLength(1);
    expect(stub.intervals[0]?.ms).toBe(ROTATION.intervalMs);
  });

  it("changes the phrase on each tick", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    mount({ document: stub.doc });
    const seen = [phraseOf(host)];
    for (let index = 0; index < PHRASES.length - 1; index += 1) {
      stub.tick();
      seen.push(phraseOf(host));
    }
    expect(new Set(seen).size).toBe(PHRASES.length);
  });

  it("clears the interval on dispose, so an unloaded plugin stops ticking", () => {
    const stub = stubDocument(turnStatus(false));
    mount({ document: stub.doc }).dispose();
    expect(stub.intervals[0]?.cleared).toBe(true);
  });
});

describe("uninstall leaves no residue", () => {
  it("restores dsh's text, removes the indicator, removes the stylesheet", () => {
    const host = turnStatus(true);
    const stub = stubDocument(host);
    mount({ document: stub.doc }).dispose();

    expect(ownText(host)).toBe("Deep diving...");
    expect(indicatorIn(host)).toHaveLength(0);
    expect(styles(stub.head)).toHaveLength(0);
    expect(stub.head.childNodes).toHaveLength(0);
  });

  it("is safe to dispose twice", () => {
    const stub = stubDocument(turnStatus(false));
    const mounted = mount({ document: stub.doc });
    mounted.dispose();
    expect(() => mounted.dispose()).not.toThrow();
  });

  it("does not let a second mount's teardown remove the first mount's stylesheet", () => {
    const stub = stubDocument(turnStatus(false));
    const first = mount({ document: stub.doc });
    const second = mount({ document: stub.doc });
    second.dispose();
    expect(styles(stub.head), "the second mount did not own the element").toHaveLength(1);
    first.dispose();
    expect(styles(stub.head)).toHaveLength(0);
  });
});

describe("teardown is registered with the host", () => {
  it("uses ctx.effect when the host has one", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    (globalThis as { document?: unknown }).document = stub.doc;

    let teardown: (() => void) | undefined;
    apply({
      effect: (setup) => {
        teardown = setup();
        return undefined;
      },
    });

    expect(indicatorIn(host)).toHaveLength(1);
    teardown?.();
    expect(indicatorIn(host)).toHaveLength(0);
    expect(ownText(host)).toBe("Deep diving...");
  });

  it("falls back to ctx.on('dispose') on a host with no effect", () => {
    const host = turnStatus(false);
    const stub = stubDocument(host);
    (globalThis as { document?: unknown }).document = stub.doc;

    const listeners: Record<string, () => void> = {};
    apply({ on: (event, listener) => (listeners[event] = listener) });

    expect(indicatorIn(host)).toHaveLength(1);
    listeners.dispose?.();
    expect(indicatorIn(host)).toHaveLength(0);
  });

  it("warns rather than pretending, on a host that offers neither", () => {
    const stub = stubDocument(turnStatus(false));
    (globalThis as { document?: unknown }).document = stub.doc;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    apply({});

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(PLUGIN_NAME);
  });

  it("does nothing at all where there is no document", () => {
    expect(() => apply({})).not.toThrow();
  });
});
