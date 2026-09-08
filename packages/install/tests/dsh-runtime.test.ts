import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BlockError } from "../src/errors";
import { loadBlockFile } from "../src/loader";

const example = (name: string) => fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

describe("dsh-runtime block", () => {
  describe("block loads and parses correctly", () => {
    it("loads the dsh-runtime.md block file", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      expect(block.frontmatter.id).toBe("dsh-runtime");
    });

    it("has steps for write-file, pnpm-install, and patch-file-exact", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const stepActions = block.frontmatter.steps.map((s) => s.action);
      expect(stepActions).toContain("write-file");
      expect(stepActions).toContain("pnpm-install");
      expect(stepActions).toContain("patch-file-exact");
    });

    it("has detect steps for path-exists and file-contains", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const detectActions = block.frontmatter.detect.map((d) => d.action);
      expect(detectActions).toContain("path-exists");
      expect(detectActions).toContain("file-contains");
    });
  });

  describe("version pin single-source-of-truth", () => {
    it("pins @deepseek-ai/dsh to 0.1.0-rc.7 in runtime/package.json step", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const writeFileStep = block.frontmatter.steps.find((s) => s.action === "write-file");
      expect(writeFileStep).toBeDefined();
      expect((writeFileStep as any).content).toContain('"@deepseek-ai/dsh": "0.1.0-rc.7"');
    });

    it("the installs prose points at the pin instead of restating it", () => {
      // I10 wants the version in ONE place: the runtime/package.json write-file
      // step. This assertion used to demand a SECOND copy of the literal here,
      // in installs[0].from, which is the duplication the criterion forbids.
      const block = loadBlockFile(example("dsh-runtime.md"));
      const from = block.frontmatter.installs[0].from ?? "";
      expect(from).not.toContain("0.1.0-rc.7");
      expect(from).toContain("@deepseek-ai/dsh");
      expect(from).toContain("package.json");
    });

    it("version appears in exactly one place in steps (no duplication)", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const steps = JSON.stringify(block.frontmatter.steps);
      const matches = steps.match(/0\.1\.0-rc\.7/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("patch-file-exact action structure", () => {
    it("includes patch-file-exact step with target, storageKey, and replacements", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const patchStep = block.frontmatter.steps.find((s) => s.action === "patch-file-exact");
      expect(patchStep).toBeDefined();
      const patch = patchStep as any;
      expect(patch.target).toContain("dsh-sandbox");
      expect(patch.storageKey).toBe("dsh-sandbox");
      expect(patch.replacements).toBeDefined();
      expect(Array.isArray(patch.replacements)).toBe(true);
      expect(patch.replacements.length).toBeGreaterThan(0);
    });

    it("no replacement's find is a substring of its replace (re-run is a no-op)", () => {
      // B3: when `find` is contained in `replace`, the second run still sees a
      // match and patches the already-patched text. Every replacement here must
      // fail to match once it has been applied.
      const block = loadBlockFile(example("dsh-runtime.md"));
      const patchStep = block.frontmatter.steps.find((s) => s.action === "patch-file-exact") as any;
      expect(patchStep.replacements.length).toBeGreaterThan(0);
      for (const replacement of patchStep.replacements) {
        expect(replacement.replace).not.toContain(replacement.find);
      }
    });

    it("includes the correct --wrapper in the fs-sandbox patch replacement", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const patchStep = block.frontmatter.steps.find((s) => s.action === "patch-file-exact") as any;
      const replacements = patchStep.replacements;
      // The scratch root is what the patch ADDS, so it belongs to `replace`.
      // Looking for it in `find` (as this assertion used to) only matched while
      // the find was a substring of the replace — the exact non-idempotence the
      // review caught, so searching `find` here would re-enshrine that bug.
      const aidosReplacement = replacements.find((r: any) => r.replace.includes("/aidos/scratch/"));
      expect(aidosReplacement).toBeDefined();
      expect(aidosReplacement.find).not.toContain("/aidos/scratch/");
      // The correct replacement includes --wrapper
      expect(aidosReplacement.replace).toContain("--");
      expect(aidosReplacement.replace).toContain("readable");
    });
  });

  describe("action schema validation", () => {
    it("write-file action requires path and content", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const writeFile = block.frontmatter.steps.find((s) => s.action === "write-file") as any;
      expect(writeFile.path).toBeDefined();
      expect(writeFile.content).toBeDefined();
      expect(writeFile.path.length).toBeGreaterThan(0);
      expect(writeFile.content.length).toBeGreaterThan(0);
    });

    it("pnpm-install action requires cwd and allows storeDir", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const pnpmInstall = block.frontmatter.steps.find((s) => s.action === "pnpm-install") as any;
      expect(pnpmInstall.cwd).toBeDefined();
      expect(pnpmInstall.cwd).toBe("runtime");
      expect(pnpmInstall.storeDir).toBeDefined();
      expect(pnpmInstall.storeDir).toBe("cache/pnpm-store");
    });

    it("file-contains detect action requires file and text", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      const detect = block.frontmatter.detect.find((d) => d.action === "file-contains") as any;
      expect(detect).toBeDefined();
      expect(detect.file).toBeDefined();
      expect(detect.text).toBeDefined();
      expect(detect.file.length).toBeGreaterThan(0);
      expect(detect.text.length).toBeGreaterThan(0);
    });
  });

  describe("prose documentation", () => {
    it("includes rationale and block body", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      expect(block.frontmatter.rationale).toBeDefined();
      expect(block.frontmatter.rationale.length).toBeGreaterThan(0);
      expect(block.body).toBeDefined();
      expect(block.body.length).toBeGreaterThan(0);
    });

    it("references dsh-home.md Q5 for the install-vs-adopt decision", () => {
      const block = loadBlockFile(example("dsh-runtime.md"));
      expect(block.body).toContain("dsh-home.md");
      expect(block.body).toContain("Q5");
    });
  });
});
