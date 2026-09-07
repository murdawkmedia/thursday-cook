import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { loadBlockFile } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

/**
 * Tests for I10's version-pin single-source-of-truth criterion:
 * "the pinned version appears in exactly one place in the file, and a mismatch fails the build"
 */
describe("I10 version pin: single source of truth", () => {
  const EXPECTED_VERSION = "0.1.0-rc.7";
  const PINNED_FILE = example("dsh-runtime.md");

  it("version is pinned in runtime/package.json step of dsh-runtime.md", () => {
    const block = loadBlockFile(PINNED_FILE);
    const writeFileStep = block.frontmatter.steps.find((s) => s.action === "write-file") as any;
    expect(writeFileStep).toBeDefined();
    expect(writeFileStep.path).toBe("runtime/package.json");
    expect(writeFileStep.content).toContain(`"@deepseek-ai/dsh": "${EXPECTED_VERSION}"`);
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
    expect(from).not.toContain(EXPECTED_VERSION);
    expect(from).toContain("@deepseek-ai/dsh");
    expect(from).toContain("package.json");
  });

  it("version appears exactly once as a literal in the entire file", () => {
    const fileContent = readFileSync(PINNED_FILE, "utf8");
    const matches = fileContent.match(/0\.1\.0-rc\.7/g);
    expect(matches).toBeDefined();
    expect(matches).toHaveLength(1);
  });

  it("prose references the pin location rather than repeating the version", () => {
    const block = loadBlockFile(PINNED_FILE);
    // The prose section (block.body) should NOT contain the literal version
    // It should instead reference where it's pinned (e.g., "the version pinned in the package.json step")
    expect(block.body).not.toContain("0.1.0-rc.7");
    expect(block.body).toContain("exactly one place");
    expect(block.body).toContain("package.json");
  });

  it("test itself scans the whole file, not just steps", () => {
    const fileContent = readFileSync(PINNED_FILE, "utf8");
    // Verify this test would catch a version mention in prose
    expect(fileContent).toContain("dsh-runtime");
    // If the version appeared twice, our regex match would have length 2
    const count = (fileContent.match(/0\.1\.0-rc\.7/g) || []).length;
    expect(count).toBe(1);
  });
});
