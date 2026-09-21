/**
 * The subset reader: what it accepts, and every shape it throws on.
 *
 * The reader is the format's immune system -- a hand edit reaching for
 * general YAML must fail HERE, with a line number, rather than parse
 * surprisingly. Each rejection below is a test, so weakening the reader
 * means deleting a test first, visibly.
 */

import { describe, expect, it } from "vitest";

import { YamlSubsetError, parseSubsetYaml } from "../src/yaml";

const TOUR_SHAPE = `tickets:
  - T1
  - T2
steps:
  - id: see-blog
    chapter: 1
    ticket: T1
    text: |
      Run this in a terminal.
      Then open the address.
    target: "[data-composer-seat]"
    teaching: "Action first."
    done:
      op: manual
  - id: verify-t1
    chapter: 1
    ticket: T1
    text: "Verify in the browser."
    target: "[data-conversation-scroll]"
    teaching: "Check, don't trust."
    done:
      op: ticket-done
      ticket: T1
`;

describe("the accepted subset", () => {
  it("parses the tour shape: tickets, steps, blocks, quotes, nested done", () => {
    expect(parseSubsetYaml(TOUR_SHAPE)).toEqual({
      tickets: ["T1", "T2"],
      steps: [
        {
          id: "see-blog",
          chapter: 1,
          ticket: "T1",
          text: "Run this in a terminal.\nThen open the address.",
          target: "[data-composer-seat]",
          teaching: "Action first.",
          done: { op: "manual" },
        },
        {
          id: "verify-t1",
          chapter: 1,
          ticket: "T1",
          text: "Verify in the browser.",
          target: "[data-conversation-scroll]",
          teaching: "Check, don't trust.",
          done: { op: "ticket-done", ticket: "T1" },
        },
      ],
    });
  });

  it("reads integers as numbers and ~ as null", () => {
    expect(parseSubsetYaml("a:\n  chapter: 2\n  ticket: ~\n")).toEqual({
      a: { chapter: 2, ticket: null },
    });
  });

  it("folds > blocks and keeps | blocks literal", () => {
    const folded = parseSubsetYaml("a:\n  text: >\n    one line\n    two lines\n");
    expect(folded).toEqual({ a: { text: "one line two lines" } });
  });

  it("ignores full-line and trailing comments", () => {
    expect(parseSubsetYaml("# lead\ntickets: # trailing\n  - T1 # one\n")).toEqual({
      tickets: ["T1"],
    });
  });

  it("unescapes single-quote doubling and double-quote escapes", () => {
    expect(parseSubsetYaml(`a: 'it''s'\nb: "x\\nY"\n`)).toEqual({ a: "it's", b: "x\nY" });
  });
});

describe("rejections", () => {
  function fails(text: string): number {
    try {
      parseSubsetYaml(text);
    } catch (error) {
      expect(error).toBeInstanceOf(YamlSubsetError);
      return (error as YamlSubsetError).line;
    }
    throw new Error("expected a YamlSubsetError and got a parse");
  }

  it("rejects flow syntax, anchors, tags and tabs, with line numbers", () => {
    expect(fails("a: [1, 2]\n")).toBe(1);
    expect(fails("a: {b: c}\n")).toBe(1);
    expect(fails("a: &x 1\n")).toBe(1);
    expect(fails("a: !tag 1\n")).toBe(1);
    expect(fails("a:\n\t- T1\n")).toBe(2);
  });

  it("rejects duplicate keys and mixed map/sequence items", () => {
    expect(fails("a: 1\na: 2\n")).toBe(2);
    expect(fails("a:\n  - T1\n  b: 2\n")).toBe(3);
  });

  it("rejects ambiguous colons in plain scalars", () => {
    expect(fails("a: Run this: now\n")).toBe(1);
  });

  it("rejects unquoted structural starts, and accepts them quoted", () => {
    expect(fails("a: [data-x]\n")).toBe(1);
    expect(parseSubsetYaml('a: "[data-x]"\n')).toEqual({ a: "[data-x]" });
  });

  it("rejects top-level sequences and empty documents", () => {
    expect(fails("- T1\n")).toBe(1);
    expect(fails("# nothing\n")).toBe(1);
  });

  it("rejects unexpected indentation", () => {
    expect(fails("a:\n  b: 1\n     c: 2\n")).toBe(3);
  });
});
