import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  linkSync,
  statSync,
  realpathSync,
} from "node:fs";

import { loadBlockFile, type Block } from "../src/loader";
import {
  planInstall,
  executeInstall,
  previewPatchFileExact,
  runDetectStep,
  createFilesystemAPI,
  type ExecutionPlan,
} from "../src/install";
import type { Step } from "../src/actions";

/**
 * End-to-end acceptance for the four actions `a6ab9b3` shipped as schemas only:
 * `write-file`, `pnpm-install`, `patch-file-exact` and the `file-contains`
 * predicate. Everything here runs the REAL `packages/blocks/dsh-runtime.md`
 * against the REAL node filesystem in a temp THURSDAY_HOME — no memfs, no
 * hand-written step literals — because the defect being guarded against is
 * precisely "the block parses, and then the installer throws at runtime".
 *
 * The patch fixture is built out of the block's own `find` strings rather than
 * a copy of them, so this test cannot drift into asserting a string literal
 * that no longer matches what the block would look for.
 */

const blockPath = fileURLToPath(new URL("../../blocks/dsh-runtime.md", import.meta.url));

const patchStepOf = (block: Block) =>
  block.frontmatter.steps.find((s) => s.action === "patch-file-exact") as Extract<
    Step,
    { action: "patch-file-exact" }
  >;

/** A file that contains each of the block's `find` anchors exactly once. */
function sandboxFixture(block: Block): string {
  const patch = patchStepOf(block);
  return [
    'import { join } from "node:path";',
    patch.replacements[0].find,
    "",
    "function canonicalPath(p) { return p; }",
    "",
    patch.replacements[1].find,
    "",
    "export { writableRoots };",
    "",
  ].join("\n");
}

describe("dsh-runtime block, end to end on a real filesystem", () => {
  let home: string;
  let dshPath: string;
  let block: Block;
  let sandboxPath: string;
  const fs = createFilesystemAPI();

  beforeEach(() => {
    home = mkdtempSync(join(realpathSync(tmpdir()), "thursday-e2e-"));
    dshPath = join(home, "dsh");
    mkdirSync(dshPath, { recursive: true });
    block = loadBlockFile(blockPath);

    // pnpm-install refuses to run against a working directory that is not
    // there, and this test must not reach the network. Materializing
    // runtime/node_modules is the same signal a completed install leaves, so
    // the executor takes its "already installed" path and stays offline.
    const patch = patchStepOf(block);
    sandboxPath = join(home, patch.target);
    mkdirSync(dirname(sandboxPath), { recursive: true });
    writeFileSync(sandboxPath, sandboxFixture(block), "utf8");
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("executes all four new actions instead of throwing 'unknown install action'", async () => {
    const plan = planInstall([block], dshPath, home, fs);
    expect(plan.steps.map((s) => s.step.action)).toEqual([
      "write-file",
      "pnpm-install",
      "patch-file-exact",
    ]);

    const result = await executeInstall(plan, dshPath, home, { quiet: true, fs });

    expect(result.problems).toEqual([]);
    expect(JSON.stringify(result.problems)).not.toContain("unknown install action");
    expect(result.steps).toHaveLength(3);

    // write-file really wrote, with the pinned dependency in it
    const pkg = readFileSync(join(home, "runtime/package.json"), "utf8");
    expect(JSON.parse(pkg).dependencies["@deepseek-ai/dsh"]).toBeTruthy();

    // pnpm-install really read the filesystem and decided not to run pnpm
    expect(result.steps[1].changed).toBe(false);
    expect(result.steps[1].output).toContain("already installed");

    // patch-file-exact really patched, and stored the original
    expect(result.steps[2].changed).toBe(true);
    const patched = readFileSync(sandboxPath, "utf8");
    expect(patched).toContain("scratchRootForWorkspace(policy.workspaceRoot)");
    expect(patched).toContain('import { homedir, tmpdir } from "node:os";');
    expect(existsSync(join(home, "state", "dsh-sandbox.orig"))).toBe(true);
    expect(readFileSync(join(home, "state", "dsh-sandbox.orig"), "utf8")).toBe(
      sandboxFixture(block)
    );

    // the file-contains predicate really reads the patched file
    const fileContains = block.frontmatter.detect.find((d) => d.action === "file-contains")!;
    expect(runDetectStep(fileContains, dshPath, home, fs)).toBe(true);
  });

  it("applying the patch twice leaves the target byte-identical", async () => {
    const plan1 = planInstall([block], dshPath, home, fs);
    await executeInstall(plan1, dshPath, home, { quiet: true, fs });
    const afterFirst = readFileSync(sandboxPath);
    const origAfterFirst = readFileSync(join(home, "state", "dsh-sandbox.orig"));

    const plan2 = planInstall([block], dshPath, home, fs);
    const result2 = await executeInstall(plan2, dshPath, home, { quiet: true, fs });
    expect(result2.problems).toEqual([]);

    const afterSecond = readFileSync(sandboxPath);
    expect(afterSecond.equals(afterFirst)).toBe(true);
    // and the stored original was not overwritten with the patched bytes
    expect(readFileSync(join(home, "state", "dsh-sandbox.orig")).equals(origAfterFirst)).toBe(
      true
    );

    // A third, forced apply of the patch step alone is still a no-op that says so.
    const patch = patchStepOf(block);
    const preview = previewPatchFileExact(patch, dshPath, home, fs);
    expect(preview.changed).toBe(false);
    expect(preview.output).toContain("already applied");
    expect(readFileSync(sandboxPath).equals(afterFirst)).toBe(true);
  });

  it("breaks hardlinks: patching does not mutate a file sharing the inode", async () => {
    // pnpm materializes node_modules as hardlinks into its content-addressable
    // store, so an in-place write to a patched file edits the store copy and
    // every other project linked to it. memfs has no hardlinks, so this can
    // only be proved on the real filesystem.
    const storeCopy = join(home, "cache", "store-copy.js");
    mkdirSync(dirname(storeCopy), { recursive: true });
    linkSync(sandboxPath, storeCopy);
    const before = readFileSync(sandboxPath, "utf8");
    expect(statSync(storeCopy).ino).toBe(statSync(sandboxPath).ino);

    const plan = planInstall([block], dshPath, home, fs);
    const result = await executeInstall(plan, dshPath, home, { quiet: true, fs });
    expect(result.problems).toEqual([]);

    // the target was patched...
    expect(readFileSync(sandboxPath, "utf8")).not.toBe(before);
    // ...and the other link to the old inode still holds the old bytes
    expect(readFileSync(storeCopy, "utf8")).toBe(before);
    expect(statSync(storeCopy).ino).not.toBe(statSync(sandboxPath).ino);
  });

  it("refuses a target whose realpath escapes THURSDAY_HOME", () => {
    const outside = mkdtempSync(join(realpathSync(tmpdir()), "thursday-outside-"));
    try {
      const victim = join(outside, "index.js");
      writeFileSync(victim, sandboxFixture(block), "utf8");
      rmSync(sandboxPath);
      symlinkSync(victim, sandboxPath);

      const patch = patchStepOf(block);
      expect(() => previewPatchFileExact(patch, dshPath, home, fs)).toThrow(
        /resolves to .*, which is outside THURSDAY_HOME/
      );
      // the file the symlink pointed at was not touched
      expect(readFileSync(victim, "utf8")).toBe(sandboxFixture(block));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("leaves the file untouched when one find does not match (all or nothing)", async () => {
    const patch = patchStepOf(block);
    // Break the SECOND anchor only. The first still matches, so a half-patching
    // implementation would write replacement 0 and then fail.
    const broken = sandboxFixture(block).replace(
      patch.replacements[1].find,
      "function writableRoots(policy) { return []; }"
    );
    writeFileSync(sandboxPath, broken, "utf8");

    const plan = planInstall([block], dshPath, home, fs);
    const result = await executeInstall(plan, dshPath, home, { quiet: true, fs });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].message).toMatch(/does not match|version skew/);
    expect(readFileSync(sandboxPath, "utf8")).toBe(broken);
    // nothing was half-written: the first replacement did not land either
    expect(readFileSync(sandboxPath, "utf8")).not.toContain(
      'import { homedir, tmpdir } from "node:os";'
    );
    // and no temp file was left behind
    expect(existsSync(`${sandboxPath}.thursday-patch-tmp`)).toBe(false);
    // no original was stored for a patch that never happened
    expect(existsSync(join(home, "state", "dsh-sandbox.orig"))).toBe(false);
  });

  it("dry-run changed flags and output match the apply that follows it", async () => {
    const plan: ExecutionPlan = planInstall([block], dshPath, home, fs);
    const before = readFileSync(sandboxPath, "utf8");

    const dry = await executeInstall(plan, dshPath, home, { dryRun: true, quiet: true, fs });
    expect(dry.problems).toEqual([]);

    // A dry run changed nothing at all.
    expect(readFileSync(sandboxPath, "utf8")).toBe(before);
    expect(existsSync(join(home, "runtime/package.json"))).toBe(false);
    expect(existsSync(join(home, "state", "dsh-sandbox.orig"))).toBe(false);

    const apply = await executeInstall(plan, dshPath, home, { dryRun: false, quiet: true, fs });
    expect(apply.problems).toEqual([]);

    expect(dry.steps.map((s) => s.changed)).toEqual(apply.steps.map((s) => s.changed));
    expect(dry.steps.map((s) => s.output)).toEqual(apply.steps.map((s) => s.output));
    expect(dry.anyChanged).toBe(apply.anyChanged);
    // and it is not vacuously equal: the run really did report changes
    expect(dry.steps.map((s) => s.changed)).toEqual([true, false, true]);
    expect(readFileSync(sandboxPath, "utf8")).not.toBe(before);
  });

  it("detect flips to installed once the block has been applied", async () => {
    const detect = block.frontmatter.detect;
    expect(detect.every((d) => runDetectStep(d, dshPath, home, fs))).toBe(false);

    const plan = planInstall([block], dshPath, home, fs);
    await executeInstall(plan, dshPath, home, { quiet: true, fs });
    // the .bin/dsh entry is pnpm's to create; the offline fake stands in for it
    mkdirSync(join(home, "runtime/node_modules/.bin"), { recursive: true });
    writeFileSync(join(home, "runtime/node_modules/.bin/dsh"), "#!/bin/sh\n", "utf8");

    expect(detect.map((d) => runDetectStep(d, dshPath, home, fs))).toEqual([true, true, true]);
    expect(planInstall([block], dshPath, home, fs).steps).toHaveLength(0);
  });
});
