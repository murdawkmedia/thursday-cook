import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBlockDir } from "../src/loader";
import { orderBlocks } from "../src/patch";

// The shipped composition, loaded through the real loader.
//
// Every other test in this package runs against fixtures, which is right --
// fixtures isolate the behaviour under test. But fixtures cannot catch the
// failure that actually happens: someone adds a file to packages/blocks and the
// whole composition stops loading. That is not a hypothetical. This test was
// written after a companion document (`llm-pi-ai.findings.md`) sitting in the
// directory made `loadBlockDir` throw on the real set; the fix was to move it
// to notes/, and this test is what stops it coming back.

const BLOCKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "blocks");

describe("the shipped block directory", () => {
  it("loads without a single problem", () => {
    // Deliberately NOT wrapped in expect(...).not.toThrow(): the BlockError
    // carries one row per bad file, and letting it escape puts every one of
    // them in the failure output. A .not.toThrow() would report "threw".
    const blocks = loadBlockDir(BLOCKS_DIR);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("has a unique id per block", () => {
    // Two blocks with one id is a merge artefact, and the loader has no reason
    // to reject it -- each file is valid on its own. The damage shows up later,
    // as a dependency edge that resolves to whichever one was loaded second.
    const ids = loadBlockDir(BLOCKS_DIR).map((b) => b.frontmatter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders without a cycle or an unresolvable dependency", () => {
    // The composition is only installable if this passes. A dependency naming a
    // block that was renamed or removed fails here rather than halfway through
    // a real install with files already on disk.
    const blocks = loadBlockDir(BLOCKS_DIR);
    const ordered = orderBlocks(blocks);
    expect(ordered).toHaveLength(blocks.length);
  });

  it("puts the runtime substrate before everything that patches it", () => {
    // Not an arbitrary assertion about the current order: dsh-runtime installs
    // dsh itself, so any block ordered before it would patch a tree that does
    // not exist yet. This is the one ordering fact the composition cannot be
    // correct without.
    const ordered = orderBlocks(loadBlockDir(BLOCKS_DIR));
    expect(ordered[0]?.frontmatter.id).toBe("dsh-runtime");
  });

  it("declares no dependency on a block that is not in the directory", () => {
    // orderBlocks may tolerate an unknown id by ignoring the edge, which would
    // silently install in the wrong order. Checked explicitly rather than
    // relying on the sort to complain.
    const blocks = loadBlockDir(BLOCKS_DIR);
    const known = new Set(blocks.map((b) => b.frontmatter.id));
    const dangling: string[] = [];
    for (const b of blocks) {
      for (const dep of b.frontmatter.dependsOn ?? []) {
        if (!known.has(dep)) dangling.push(`${b.frontmatter.id} -> ${dep}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
