import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadBlockFile } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

/**
 * Tests for I10's version-pin single-source-of-truth criterion:
 * "the pinned version appears in exactly one file, and a mismatch fails the build"
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

  it("version in package.json step matches the installs section", () => {
    const block = loadBlockFile(PINNED_FILE);
    const installEntry = block.frontmatter.installs[0];
    expect(installEntry.from).toContain(EXPECTED_VERSION);
  });

  it("block body documents how the version was determined", () => {
    const block = loadBlockFile(PINNED_FILE);
    // The prose should explain where the version came from
    expect(block.body).toContain("0.1.0-rc.7");
    expect(block.body).toContain("/home/sid/.local/share/fnm");
  });

  it("version only appears once in steps (no separate duplication)", () => {
    const block = loadBlockFile(PINNED_FILE);
    // Count version mentions in steps only (not body)
    const stepsJson = JSON.stringify(block.frontmatter.steps);
    const versionMatches = stepsJson.match(/0\.1\.0-rc\.7/g);
    // Should be exactly 1 in the write-file content string
    expect(versionMatches).toBeDefined();
    expect(versionMatches!.length).toBe(1);
  });
});
