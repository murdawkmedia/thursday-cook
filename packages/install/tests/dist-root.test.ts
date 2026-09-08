import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, afterEach } from "vitest";

import { DIST_ROOT_MARKERS, distributionRoot, findDistributionRoot } from "../src/dist-root";

// The resolver answers from the engine's own module location, never from the
// process working directory — the distinction ticket I9 exists to enforce. A
// checkout path or cwd() is right in exactly one of the four layouts
// `thursday install` runs from (checkout, global npm prefix, pnpm link,
// container image); walking up from import.meta.url is right in all four.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

let scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});

function makeTree(): string {
  const dir = mkdtempSync(join(tmpdir(), "thursday-dist-root-"));
  scratch.push(dir);
  return dir;
}

describe("findDistributionRoot", () => {
  it("finds the checkout root from the install package's own source dir", () => {
    // The engine's own location, not a path anyone passed in.
    expect(findDistributionRoot(join(here, "..", "src"))).toBe(findDistributionRoot(repoRoot));
  });

  it("finds the root from a deeply nested directory", () => {
    const root = makeTree();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "config", "AGENTS.md"), "");
    const deep = join(root, "a", "b", "c");
    mkdirSync(deep, { recursive: true });
    expect(findDistributionRoot(deep)).toBe(root);
  });

  it("requires every marker, not just one", () => {
    const root = makeTree();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    const deep = join(root, "sub");
    mkdirSync(deep, { recursive: true });
    // config/AGENTS.md is absent: the search must pass this tree by. It will
    // run to the filesystem root and throw there rather than return a
    // half-distribution.
    expect(() => findDistributionRoot(deep)).toThrow(/distribution root not found/);
  });

  it("names the start directory and the markers when nothing is found", () => {
    const root = makeTree();
    let message = "";
    try {
      findDistributionRoot(root);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("distribution root not found");
    expect(message).toContain(root);
    for (const marker of DIST_ROOT_MARKERS) expect(message).toContain(marker);
  });

  it("does not depend on the process working directory", () => {
    const root = makeTree();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "config", "AGENTS.md"), "");
    const elsewhere = makeTree();
    const previous = process.cwd();
    process.chdir(elsewhere);
    try {
      expect(findDistributionRoot(join(root, "sub", "..", "."))).toBe(root);
    } finally {
      process.chdir(previous);
    }
  });
});

describe("distributionRoot", () => {
  it("resolves to a tree holding the marker files", () => {
    for (const marker of DIST_ROOT_MARKERS) {
      expect(existsSync(join(distributionRoot, marker))).toBe(true);
    }
  });

  it("is the checkout root, however the tests were launched", () => {
    expect(distributionRoot).toBe(findDistributionRoot(here));
  });
});
