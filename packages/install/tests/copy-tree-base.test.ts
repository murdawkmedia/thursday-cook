import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fs as memfsFs, vol } from "memfs";
import { describe, expect, it, beforeEach } from "vitest";

import { validateStepList, type Step } from "../src/actions";
import { distributionRoot } from "../src/dist-root";
import { executeStep, planCopyTree, type FilesystemAPI, type PlannedStep } from "../src/install";
import { loadBlockFile } from "../src/loader";
import type { BlockProblem } from "../src/errors";

// Covers ticket I9: copy-tree sources resolve against the Thursday
// distribution by default, the dsh home only when the step says so, single
// files copy as files, and a missing source names the block, the step and the
// root — plus the trap: the aidos step must stay dsh-relative.

const here = dirname(fileURLToPath(import.meta.url));
const blocksDir = join(here, "..", "..", "blocks");

function createMemfsAPI(): FilesystemAPI {
  const mfs = memfsFs as any;
  return {
    existsSync: mfs.existsSync.bind(mfs),
    readFileSync: mfs.readFileSync.bind(mfs),
    writeFileSync: mfs.writeFileSync.bind(mfs),
    mkdirSync: mfs.mkdirSync.bind(mfs),
    realpathSync: mfs.realpathSync.bind(mfs),
    renameSync: mfs.renameSync.bind(mfs),
    unlinkSync: mfs.unlinkSync.bind(mfs),
    readdirSync: mfs.readdirSync.bind(mfs),
    statSync: mfs.statSync.bind(mfs),
    promises: {
      readFile: mfs.promises.readFile.bind(mfs.promises),
      writeFile: mfs.promises.writeFile.bind(mfs.promises),
      mkdir: mfs.promises.mkdir.bind(mfs.promises),
      cp: mfs.promises.cp.bind(mfs.promises),
    },
  };
}

function planned(blockId: string, index: number, step: Step): PlannedStep {
  return { blockId, blockRationale: "test", index, step, dryRun: false };
}

beforeEach(() => {
  vol.reset();
});

describe("copy-tree base defaults", () => {
  it("defaults a bare copy-tree source to the distribution", () => {
    const problems: BlockProblem[] = [];
    const out = validateStepList(
      [{ action: "copy-tree", from: "skills", to: "skills" }],
      "install",
      "steps",
      problems,
    );
    expect(problems).toEqual([]);
    expect(out[0]).toMatchObject({ action: "copy-tree", base: "dist" });
  });

  it("keeps an explicit dsh base", () => {
    const problems: BlockProblem[] = [];
    const out = validateStepList(
      [
        {
          action: "copy-tree",
          from: "profiles/web/node_modules/aidos/skills",
          to: "skills/aidos",
          base: "dsh",
        },
      ],
      "install",
      "steps",
      problems,
    );
    expect(problems).toEqual([]);
    expect(out[0]).toMatchObject({ base: "dsh" });
  });

  it("rejects a home base: copy sources come from dist or dsh, never the target home", () => {
    const problems: BlockProblem[] = [];
    validateStepList(
      [{ action: "copy-tree", from: "skills", to: "skills", base: "home" }],
      "install",
      "steps",
      problems,
    );
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe("copy-tree from the distribution root", () => {
  it("copies a dist directory into the dsh home", async () => {
    vol.fromJSON(
      {
        "/dist/skills/demo/SKILL.md": "# demo\n",
        "/home/dsh/placeholder.txt": "keep me\n",
      },
      "/",
    );
    const fs = createMemfsAPI();
    const step = {
      action: "copy-tree",
      from: "skills",
      to: "skills",
      base: "dist",
      prune: false,
    } as Step;
    const result = await executeStep(
      planned("skills", 0, step),
      "/home/dsh",
      "/home",
      fs,
      false,
      "/dist",
    );
    expect(result.changed).toBe(true);
    expect(result.output).toContain("Copied tree");
    expect(fs.readFileSync("/home/dsh/skills/demo/SKILL.md", "utf8")).toBe("# demo\n");

    // Idempotent: the second run changes nothing.
    const again = await executeStep(
      planned("skills", 0, step),
      "/home/dsh",
      "/home",
      fs,
      false,
      "/dist",
    );
    expect(again.changed).toBe(false);
  });

  it("copies a single dist file to a destination file", async () => {
    vol.fromJSON({ "/dist/config/settings.yaml": "profile:\n  active: personal\n" }, "/");
    const fs = createMemfsAPI();
    const step = {
      action: "copy-tree",
      from: "config/settings.yaml",
      to: "settings.yaml",
      base: "dist",
      prune: false,
    } as Step;
    const result = await executeStep(
      planned("thursday-defaults", 0, step),
      "/home/dsh",
      "/home",
      fs,
      false,
      "/dist",
    );
    expect(result.changed).toBe(true);
    expect(result.output).toContain("Copied file");
    expect(fs.readFileSync("/home/dsh/settings.yaml", "utf8")).toContain("active: personal");

    const again = await executeStep(
      planned("thursday-defaults", 0, step),
      "/home/dsh",
      "/home",
      fs,
      false,
      "/dist",
    );
    expect(again.changed).toBe(false);
    expect(again.output).toContain("already current");
  });

  it("a missing dist source names the block, the step and the distribution root", async () => {
    vol.fromJSON({}, "/");
    const fs = createMemfsAPI();
    const step = { action: "copy-tree", from: "nope/missing", to: "x", base: "dist" } as Step;
    let message = "";
    try {
      await executeStep(planned("skills", 2, step), "/home/dsh", "/home", fs, false, "/dist");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("skills");
    expect(message).toContain("2");
    expect(message).toContain("Thursday distribution");
    expect(message).toContain(join("/dist", "nope/missing"));
  });

  it("a missing dsh source names the dsh home and the step that should have installed it", async () => {
    vol.fromJSON({}, "/");
    const fs = createMemfsAPI();
    const step = {
      action: "copy-tree",
      from: "profiles/web/node_modules/aidos/skills",
      to: "skills/aidos",
      base: "dsh",
    } as Step;
    let message = "";
    try {
      await executeStep(planned("aidos", 2, step), "/home/dsh", "/home", fs, false, "/dist");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("aidos");
    expect(message).toContain("dsh home");
    expect(message).toContain("pnpm-add");
  });

  it("planCopyTree compares a single file byte for byte", () => {
    vol.fromJSON({ "/dist/a.txt": "same\n", "/home/dsh/a.txt": "same\n" }, "/");
    const fs = createMemfsAPI();
    expect(planCopyTree("/dist/a.txt", "/home/dsh/a.txt", fs)).toEqual({
      directories: [],
      files: [],
    });
    vol.fromJSON({ "/dist/a.txt": "new\n" });
    expect(planCopyTree("/dist/a.txt", "/home/dsh/a.txt", fs).files).toHaveLength(1);
  });
});

describe("the shipped composition after I9", () => {
  function copySteps(id: string): Step[] {
    const block = loadBlockFile(join(blocksDir, `${id}.md`));
    return block.frontmatter.steps.filter((s) => s.action === "copy-tree");
  }

  it("every default-based copy-tree source resolves to a file that exists in the distribution", () => {
    // The assertion, not an eyeball: each `from` with no explicit base (or an
    // explicit dist base) must name something real under the resolved root.
    const ids = ["agents-md", "mcp-servers", "skills", "host-plane", "thursday-defaults"];
    const missing: string[] = [];
    for (const id of ids) {
      for (const step of copySteps(id)) {
        if (step.action !== "copy-tree") continue;
        if (step.base !== "dist") {
          missing.push(`${id}: unexpected base ${(step as { base?: string }).base}`);
          continue;
        }
        const abs = join(distributionRoot, step.from);
        if (!existsSync(abs)) missing.push(`${id}: ${step.from} (resolved to ${abs})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the six I9 sources are exactly these", () => {
    const froms: string[] = [];
    for (const id of ["agents-md", "mcp-servers", "skills", "host-plane", "thursday-defaults"]) {
      for (const step of copySteps(id)) {
        if (step.action === "copy-tree") froms.push(`${id} from: ${step.from}`);
      }
    }
    expect(froms).toEqual([
      "agents-md from: config/AGENTS.md",
      "mcp-servers from: config/mcp-servers.json",
      "skills from: skills",
      "host-plane from: packages/plugins",
      "host-plane from: config/guards",
      "thursday-defaults from: config/settings.yaml",
    ]);
  });

  it("aidos still resolves against the dsh home — the trap stays shut", () => {
    const steps = copySteps("aidos");
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      action: "copy-tree",
      from: "profiles/web/node_modules/aidos/skills",
      base: "dsh",
    });
  });
});
