import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { loadBlockFile } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

/** Escape a version string for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tests for I10's version-pin single-source-of-truth criterion:
 * "the pinned version appears in exactly one place in the file, and a mismatch fails the build"
 *
 * THE VERSION IS READ FROM THE BLOCK, NOT WRITTEN DOWN HERE. It used to be a
 * const in this file, repeated across five assertions and two regexes. That
 * made the test a SECOND source of truth for the very value it exists to keep
 * single-sourced: bumping the pin turned five of these cases red, and the only
 * way to make them green was to edit the number in both places -- which is the
 * exact duplication I10 forbids, relocated into the guard. Discovered on
 * 2026-09-16 bumping 0.1.0-rc.7 to 0.1.5-rc.1.
 *
 * Deriving it keeps every property I10 actually asks for. The literal must
 * still appear exactly once in the file; the installs entry must still refer to
 * the pin rather than restate it; the prose must still not repeat it. What is
 * gone is the test's own opinion about WHICH version that is, which was never
 * part of the criterion.
 */
describe("I10 version pin: single source of truth", () => {
  const PINNED_FILE = example("dsh-runtime.md");

  /** The pinned version, taken from the one place the block is allowed to state it. */
  const pinnedVersion = (): string => {
    const block = loadBlockFile(PINNED_FILE);
    const writeFileStep = block.frontmatter.steps.find((s) => s.action === "write-file") as any;
    const content = String(writeFileStep?.content ?? "");
    const match = content.match(/"@deepseek-ai\/dsh":\s*"([^"]+)"/);
    if (match === null) throw new Error("no @deepseek-ai/dsh pin found in the write-file step");
    return match[1];
  };

  it("version is pinned in the runtime/package.json step of dsh-runtime.md", () => {
    const block = loadBlockFile(PINNED_FILE);
    const writeFileStep = block.frontmatter.steps.find((s) => s.action === "write-file") as any;
    expect(writeFileStep).toBeDefined();
    expect(writeFileStep.path).toBe("runtime/package.json");
    expect(writeFileStep.content).toContain(`"@deepseek-ai/dsh": "${pinnedVersion()}"`);
  });

  it("the pin is a real version rather than a range or a tag", () => {
    // A caret, a tilde or a dist-tag here would defeat the whole point: the
    // installed version could then change without this file changing.
    const version = pinnedVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it("installs section points at the pin instead of carrying a second copy", () => {
    // NOTE: as recovered, this case asserted installs[0].from CONTAINS the
    // literal. That is unsatisfiable together with the two whole-file counts
    // below: no static file can hold the literal in installs[0].from AND in the
    // write-file content AND exactly once in total. The count assertions are the
    // ones I10 actually asks for, so they are left untouched and this case now
    // states the same cross-consistency requirement the right way round — the
    // installs entry must REFER to the pin, not restate it.
    const block = loadBlockFile(PINNED_FILE);
    const installEntry = block.frontmatter.installs[0];
    const from = installEntry.from ?? "";
    expect(from).not.toContain(pinnedVersion());
    expect(from).toContain("@deepseek-ai/dsh");
    expect(from).toContain("package.json");
  });

  it("version appears exactly once as a literal in the entire file", () => {
    const fileContent = readFileSync(PINNED_FILE, "utf8");
    const matches = fileContent.match(new RegExp(escapeRe(pinnedVersion()), "g"));
    expect(matches).toBeDefined();
    expect(matches).toHaveLength(1);
  });

  it("prose references the pin location rather than repeating the version", () => {
    const block = loadBlockFile(PINNED_FILE);
    // The prose section (block.body) should NOT contain the literal version
    // It should instead reference where it's pinned (e.g., "the version pinned in the package.json step")
    expect(block.body).not.toContain(pinnedVersion());
    expect(block.body).toContain("exactly one place");
    expect(block.body).toContain("package.json");
  });

  it("test itself scans the whole file, not just steps", () => {
    const fileContent = readFileSync(PINNED_FILE, "utf8");
    // Verify this test would catch a version mention in prose
    expect(fileContent).toContain("dsh-runtime");
    // If the version appeared twice, our regex match would have length 2
    const count = (fileContent.match(new RegExp(escapeRe(pinnedVersion()), "g")) || []).length;
    expect(count).toBe(1);
  });
});
