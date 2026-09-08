import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlockError } from "../src/errors";
import { loadBlockDir } from "../src/loader";
import { orderBlocks } from "../src/patch";

// A minimal block that the loader accepts, parameterised by id so a directory
// can hold several. Kept deliberately small: these tests are about DIRECTORY
// behaviour, and a fixture rich enough to be interesting would make a parse
// failure look like a directory failure.
const block = (id: string, dependsOn: readonly string[] = []) =>
  [
    "---",
    `id: ${id}`,
    `title: ${id}`,
    "version: 1",
    `rationale: A fixture block for directory-loading tests.`,
    `dependsOn: [${dependsOn.join(", ")}]`,
    "steps:",
    "  - action: pnpm-add",
    `    spec: "${id}-package@1.0.0"`,
    "    why: The fixture needs one real step; a block with no steps is invalid.",
    "detect:",
    "  - action: package-installed",
    `    name: ${id}-package`,
    "---",
    "",
    `# ${id}`,
    "",
    "Body prose.",
  ].join("\n");

describe("loadBlockDir", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "thursday-blocks-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads every block file in the directory", () => {
    writeFileSync(join(dir, "alpha.md"), block("alpha"));
    writeFileSync(join(dir, "beta.md"), block("beta"));

    const blocks = loadBlockDir(dir);
    expect(blocks.map((b) => b.frontmatter.id)).toEqual(["alpha", "beta"]);
  });

  it("ignores README.md by default", () => {
    // Documentation lives beside the blocks; it is not a block, and it has no
    // frontmatter, so without this default the directory never loads at all.
    writeFileSync(join(dir, "alpha.md"), block("alpha"));
    writeFileSync(join(dir, "README.md"), "# Blocks\n\nProse, not a block.\n");

    expect(loadBlockDir(dir).map((b) => b.frontmatter.id)).toEqual(["alpha"]);
  });

  it("does not descend into subdirectories", () => {
    // The rule that keeps the loader strict: every top-level .md IS a block,
    // and anything that is not one goes in a subdirectory. Without this, the
    // alternative is skipping files that fail to parse -- which is exactly how
    // a real block with a typo'd frontmatter would vanish silently.
    writeFileSync(join(dir, "alpha.md"), block("alpha"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "notes", "findings.md"), "# Notes\n\nNot a block.\n");

    expect(loadBlockDir(dir).map((b) => b.frontmatter.id)).toEqual(["alpha"]);
  });

  it("ignores non-markdown files", () => {
    writeFileSync(join(dir, "alpha.md"), block("alpha"));
    writeFileSync(join(dir, "loader-output.txt"), "not markdown");
    writeFileSync(join(dir, "verify.mjs"), "// not markdown");

    expect(loadBlockDir(dir).map((b) => b.frontmatter.id)).toEqual(["alpha"]);
  });

  it("reports EVERY bad file, not just the first", () => {
    // The person hitting this is usually mid-install. Stopping at the first
    // failure turns five broken blocks into five edit-run cycles with no way
    // to know how many remain.
    writeFileSync(join(dir, "good.md"), block("good"));
    writeFileSync(join(dir, "bad-one.md"), "no frontmatter here\n");
    writeFileSync(join(dir, "bad-two.md"), "also no frontmatter\n");

    let caught: unknown;
    try {
      loadBlockDir(dir);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BlockError);
    const problems = (caught as BlockError).problems;
    expect(problems).toHaveLength(2);
    expect(
      problems
        .map((p) => p.field)
        .sort()
        .join(" "),
    ).toContain("bad-one.md");
    expect(
      problems
        .map((p) => p.field)
        .sort()
        .join(" "),
    ).toContain("bad-two.md");
    // ...and the message says how many of how many, so the reader knows the
    // scale of the problem without counting rows.
    expect((caught as BlockError).message).toContain("2 of 3");
  });

  it("throws a BlockError, not a bare ENOENT, for a missing directory", () => {
    // A raw fs error here reads as an internal fault. The caller is a user who
    // pointed the installer at the wrong path.
    let caught: unknown;
    try {
      loadBlockDir(join(dir, "does-not-exist"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BlockError);
    expect((caught as BlockError).message).toContain("cannot read block directory");
  });

  it("returns an empty array for an empty directory rather than throwing", () => {
    // Distinguishable from "cannot read": a composition with nothing in it is
    // a valid, if useless, state, and the caller decides what to do about it.
    expect(loadBlockDir(dir)).toEqual([]);
  });

  it("honours an explicit ignore list", () => {
    writeFileSync(join(dir, "alpha.md"), block("alpha"));
    writeFileSync(join(dir, "beta.md"), block("beta"));

    expect(loadBlockDir(dir, { ignore: ["beta.md"] }).map((b) => b.frontmatter.id)).toEqual([
      "alpha",
    ]);
  });

  it("orders by filename for a deterministic result, NOT for dependency order", () => {
    // Filename order must not be load-bearing: `zulu` is declared first in the
    // dependency graph but sorts last. loadBlockDir returns it last; orderBlocks
    // puts it first. If loadBlockDir's order ever became the install order, this
    // is the case that would break.
    writeFileSync(join(dir, "alpha.md"), block("alpha", ["zulu"]));
    writeFileSync(join(dir, "zulu.md"), block("zulu"));

    const loaded = loadBlockDir(dir);
    expect(loaded.map((b) => b.frontmatter.id)).toEqual(["alpha", "zulu"]);
    expect(orderBlocks(loaded).map((b) => b.frontmatter.id)).toEqual(["zulu", "alpha"]);
  });
});
