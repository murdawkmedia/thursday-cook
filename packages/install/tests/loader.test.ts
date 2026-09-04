import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BlockError } from "../src/errors";
import { constraintsNamed, hasConstraint, loadBlockFile, parseBlock } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));

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

describe("a valid block loads", () => {
  it("parses frontmatter, prose and defaults", () => {
    const b = loadBlockFile(example("llm-pi-ai.md"));

    expect(b.frontmatter.id).toBe("llm-pi-ai");
    expect(b.frontmatter.version).toBe(1);
    expect(b.frontmatter.dependsOn).toEqual(["dsh-runtime"]);
    expect(b.frontmatter.rationale).toContain("vendored fork");
    // Absent list fields default to empty rather than undefined.
    expect(b.frontmatter.modifies).toEqual([]);
    // Action defaults are applied at load time, not at run time.
    expect(b.frontmatter.steps[0]).toEqual({
      action: "pnpm-add",
      spec: "./packages/plugins/llm-pi-ai",
      profile: "web",
      allowBuilds: false,
    });
    expect(b.frontmatter.detect[0]?.action).toBe("row-present");
    expect(b.frontmatter.reverse).toBeUndefined();
    expect(b.body).toContain("# llm-pi-ai");
  });

  it("accepts every example block in this package", () => {
    for (const name of [
      "llm-pi-ai.md",
      "compaction-instant.md",
      "aidos.md",
      "thursday-defaults.md",
    ]) {
      expect(loadBlockFile(example(name)).frontmatter.id).toBeTruthy();
    }
  });
});

describe("an invalid block is rejected", () => {
  it("names a missing required field", () => {
    const problems = problemsOf(
      block(`id: no-rationale
version: 1
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`),
    );

    expect(problems.map((p) => p.field)).toContain("rationale");
  });

  it("names a field of the wrong type", () => {
    const problems = problemsOf(block(MINIMAL.replace("version: 1", "version: one")));
    expect(problems.map((p) => p.field)).toContain("version");
    expect(problems[0]?.message).toMatch(/number/i);
  });

  it("names a bad field inside a list item", () => {
    const problems = problemsOf(
      block(`${MINIMAL}
modifies:
  - file: settings.yaml
    why: ''`),
    );
    expect(problems.map((p) => p.field)).toContain("modifies[0].why");
  });

  it("names an unknown field rather than ignoring it", () => {
    const problems = problemsOf(
      block(`${MINIMAL}
instals:
  - path: skills`),
    );
    expect(problems[0]?.field).toBe("frontmatter");
    expect(problems[0]?.message).toContain("instals");
  });

  it("names a bad parameter of a step", () => {
    const problems = problemsOf(
      block(`id: bad-param
version: 1
rationale: r
steps:
  - action: pnpm-add
    spec: 42
detect:
  - action: path-exists
    path: b`),
    );
    expect(problems.map((p) => p.field)).toContain("steps[0].spec");
  });

  it("reports the whole error message with the source and every bad field", () => {
    let message = "";
    try {
      parseBlock(block(MINIMAL.replace("version: 1", "version: 0")), "blocks/minimal.md");
    } catch (err) {
      message = (err as BlockError).message;
    }
    expect(message).toContain("blocks/minimal.md");
    expect(message).toContain("version:");
  });

  it("rejects a file with no frontmatter", () => {
    expect(problemsOf("# just prose\n")[0]?.field).toBe("frontmatter");
  });
});

describe("an unknown action is rejected", () => {
  it("names the step and lists the known actions", () => {
    const problems = problemsOf(
      block(`id: unknown-action
version: 1
rationale: r
steps:
  - action: frobnicate
    target: everything
detect:
  - action: path-exists
    path: b`),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe("steps[0].action");
    expect(problems[0]?.message).toContain("unknown action `frobnicate`");
    expect(problems[0]?.message).toContain("pnpm-add");
  });

  it("refuses a detect action used as an install step", () => {
    const problems = problemsOf(
      block(`id: wrong-kind
version: 1
rationale: r
steps:
  - action: path-exists
    path: b
detect:
  - action: path-exists
    path: b`),
    );
    expect(problems[0]?.field).toBe("steps[0].action");
    expect(problems[0]?.message).toContain("can only appear in `detect`");
  });

  it("refuses an install action used for detection", () => {
    const problems = problemsOf(
      block(`id: wrong-kind-2
version: 1
rationale: r
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: pnpm-add
    spec: x`),
    );
    expect(problems[0]?.field).toBe("detect[0].action");
    expect(problems[0]?.message).toContain("cannot be used for detection");
  });
});

describe("run is a last resort with a mandatory reason", () => {
  it("rejects a run step with no why", () => {
    const problems = problemsOf(
      block(`id: raw-shell
version: 1
rationale: r
steps:
  - action: run
    command: vendor-setup.sh
detect:
  - action: path-exists
    path: b`),
    );
    expect(problems.map((p) => p.field)).toContain("steps[0].why");
  });

  it("accepts one that carries a reason", () => {
    const b = parseBlock(
      block(`id: raw-shell
version: 1
rationale: r
steps:
  - action: run
    command: vendor-setup.sh
    why: the vendor ships no API, only this installer.
detect:
  - action: path-exists
    path: b`),
    );
    expect(b.frontmatter.steps[0]).toMatchObject({ action: "run", args: [] });
  });
});

describe("constraints are data the loader surfaces", () => {
  it("surfaces a block-level constraint with its registry definition", () => {
    const b = loadBlockFile(example("compaction-instant.md"));
    const surfaced = constraintsNamed(b, "alias-install-name");

    expect(surfaced.map((c) => c.where)).toEqual(["constraints[0]", "steps[0]"]);
    expect(surfaced[0]?.why).toContain("duplicate loader entry id");
    expect(surfaced[0]?.definition.honouredBy).toContain("pnpm-add");
    expect(hasConstraint(b, "top-level-override")).toBe(true);
  });

  it("surfaces no-yaml-round-trip from a file entry and from the step", () => {
    const b = loadBlockFile(example("thursday-defaults.md"));
    const surfaced = constraintsNamed(b, "no-yaml-round-trip");

    expect(surfaced.map((c) => c.where)).toEqual(["modifies[0]", "steps[1]"]);
    expect(surfaced[0]?.definition.failureMode).toContain("off:");
  });

  it("rejects a constraint name it does not know", () => {
    const problems = problemsOf(
      block(`${MINIMAL}
constraints:
  - name: be-careful
    why: vibes`),
    );
    expect(problems[0]?.field).toBe("constraints[0].name");
  });

  it("rejects a constraint the step's action does not honour", () => {
    const problems = problemsOf(
      block(`id: mismatched
version: 1
rationale: r
steps:
  - action: copy-tree
    from: a
    to: b
    constraint: no-yaml-round-trip
    why: it is a yaml file, honest
detect:
  - action: path-exists
    path: b`),
    );
    expect(problems[0]?.field).toBe("steps[0].constraint");
    expect(problems[0]?.message).toContain("does not honour");
  });

  it("requires a reason beside a constraint on a step", () => {
    const problems = problemsOf(
      block(`id: no-reason
version: 1
rationale: r
steps:
  - action: disable-row
    id: llm-pi-ai
    constraint: top-level-override
detect:
  - action: path-exists
    path: b`),
    );
    expect(problems[0]?.field).toBe("steps[0].why");
  });
});

describe("reverse is optional and unused", () => {
  it("loads a block that omits it", () => {
    expect(parseBlock(block(MINIMAL)).frontmatter.reverse).toBeUndefined();
  });

  it("validates it exactly like steps when present", () => {
    const b = parseBlock(
      block(`${MINIMAL}
reverse:
  - action: disable-row
    id: minimal`),
    );
    expect(b.frontmatter.reverse?.[0]).toEqual({ action: "disable-row", id: "minimal" });

    const problems = problemsOf(
      block(`${MINIMAL}
reverse:
  - action: unmake
    id: minimal`),
    );
    expect(problems[0]?.field).toBe("reverse[0].action");
  });
});

describe("no logic in frontmatter", () => {
  it("rejects a conditional key anywhere", () => {
    const problems = problemsOf(
      block(`${MINIMAL}
commands:
  - name: thursday
    if: linux`),
    );
    expect(problems[0]?.field).toBe("commands[0].if");
    expect(problems[0]?.message).toContain("control flow");
  });

  it("rejects templating in a value", () => {
    const problems = problemsOf(block(MINIMAL.replace("    to: b", "    to: '{{ home }}/b'")));
    expect(problems[0]?.field).toBe("steps[0].to");
    expect(problems[0]?.message).toContain("templating");
  });
});
