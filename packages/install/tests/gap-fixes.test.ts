import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { rowPresentSatisfied } from "../src/actions";
import { CONSTRAINTS } from "../src/constraints";
import { BlockError } from "../src/errors";
import { constraintsNamed, loadBlockFile, parseBlock } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

/** A minimal block that validates, used as the base for the negative cases. */
function block(frontmatter: string, body = "# t\n\nprose.\n"): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

const MINIMAL = `id: minimal
version: 1
rationale: A minimal block, for tests.
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`;

/** Parse expecting failure, and return the collected problems. */
function problemsOf(text: string): { field: string; message: string }[] {
  try {
    parseBlock(text, "<test>");
  } catch (err) {
    expect(err).toBeInstanceOf(BlockError);
    return [...(err as BlockError).problems];
  }
  throw new Error("expected the block to be rejected, but it loaded");
}

describe("row-present can assert a row is disabled", () => {
  it("fails when the row is absent", () => {
    expect(rowPresentSatisfied({ disabled: true }, undefined)).toBe(false);
  });

  it("fails when the row is present but not disabled", () => {
    expect(rowPresentSatisfied({ disabled: true }, { disabled: false })).toBe(false);
  });

  it("passes when the row is present and disabled", () => {
    expect(rowPresentSatisfied({ disabled: true }, { disabled: true })).toBe(true);
  });

  it("ignores disabled when the step did not ask", () => {
    expect(rowPresentSatisfied({}, { disabled: false })).toBe(true);
    expect(rowPresentSatisfied({}, { disabled: true })).toBe(true);
  });

  it("still honours the name check", () => {
    expect(rowPresentSatisfied({ name: "@deepseek-ai/dsh-llm-pi-ai", disabled: true }, { name: "@deepseek-ai/dsh-llm-pi-ai", disabled: true })).toBe(true);
    expect(rowPresentSatisfied({ name: "@deepseek-ai/dsh-llm-pi-ai", disabled: true }, { name: "other", disabled: true })).toBe(false);
  });

  it("parses `disabled: true` on a detect step and the pilot block states the guarantee", () => {
    const b = loadBlockFile(example("llm-pi-ai.md"));
    expect(b.frontmatter.detect[2]).toEqual({
      action: "row-present",
      id: "llm-pi-ai",
      placement: "override",
      disabled: true,
    });
  });
});

describe("wholesale-override-config is its own constraint", () => {
  const overrideWithConfig = (constraint: string | null): string =>
    block(`id: wholesale
version: 1
rationale: r
steps:
  - action: patch-row
    id: remote
    placement: override
    config:
      model: gpt-4o${constraint === null ? "" : `
    constraint: ${constraint}
    why: the base row's defaults are all restated here`}
detect:
  - action: path-exists
    path: b`);

  it("rejects an override patch-row with a config that declares only top-level-override, naming the missing constraint", () => {
    const problems = problemsOf(overrideWithConfig("top-level-override"));
    expect(problems[0]?.field).toBe("steps[0].constraint");
    expect(problems[0]?.message).toContain("wholesale-override-config");
    expect(problems[0]?.message).toContain("restate every default");
  });

  it("rejects one that declares no constraint at all", () => {
    const problems = problemsOf(overrideWithConfig(null));
    expect(problems[0]?.field).toBe("steps[0].constraint");
    expect(problems[0]?.message).toContain("wholesale-override-config");
  });

  it("accepts one that declares wholesale-override-config, and surfaces it", () => {
    const b = parseBlock(overrideWithConfig("wholesale-override-config"));
    expect(constraintsNamed(b, "wholesale-override-config").map((c) => c.where)).toEqual([
      "steps[0]",
    ]);
  });

  it("accepts an INSERT patch-row with a config and no such constraint", () => {
    const b = parseBlock(
      block(`id: insert-config
version: 1
rationale: r
steps:
  - action: patch-row
    id: mine
    config:
      model: gpt-4o
detect:
  - action: path-exists
    path: b`),
    );
    expect(b.frontmatter.steps[0]).toMatchObject({ action: "patch-row", placement: "insert" });
  });

  it("accepts an override patch-row with no config (the bare disable case)", () => {
    const b = parseBlock(
      block(`id: bare-override
version: 1
rationale: r
steps:
  - action: patch-row
    id: llm-pi-ai
    placement: override
detect:
  - action: path-exists
    path: b`),
    );
    expect(b.frontmatter.steps[0]).toMatchObject({ placement: "override" });
  });

  it("applies the same check to reverse steps", () => {
    const problems = problemsOf(
      block(`${MINIMAL}
reverse:
  - action: patch-row
    id: remote
    placement: override
    config:
      model: gpt-4o`),
    );
    expect(problems[0]?.field).toBe("reverse[0].constraint");
    expect(problems[0]?.message).toContain("wholesale-override-config");
  });

  it("the registry entry carries the completeness failure mode, and top-level-override keeps only placement", () => {
    expect(CONSTRAINTS["top-level-override"].failureMode).toContain("duplicate loader entry id");
    expect(CONSTRAINTS["top-level-override"].failureMode).not.toContain("restate every default");
    expect(CONSTRAINTS["wholesale-override-config"].failureMode).toContain(
      "target[key] = value",
    );
    expect(CONSTRAINTS["wholesale-override-config"].honouredBy).toContain("patch-row");
  });
});
