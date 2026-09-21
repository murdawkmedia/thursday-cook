import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";

import { fs as memfsFs, vol } from "memfs";
import { describe, expect, it, beforeEach } from "vitest";
import { parse as parseYaml } from "yaml";

import type { Step } from "../src/actions";
import {
  assertPnpmInstallLanded,
  createFilesystemAPI,
  ensureHomeWorkspaceMarker,
  ensurePnpmInstallRoot,
  executeStep,
  HOME_WORKSPACE_MARKER_CONTENT,
  install,
  normaliseIgnoredBuilds,
  PNPM_INSTALL_ROOT_CONTENT,
  type FilesystemAPI,
  type PlannedStep,
} from "../src/install";

// Covers ticket #240: with THURSDAY_HOME inside a pnpm workspace, the
// pnpm-install step reported success while installing nothing — pnpm walked up
// from the cwd, found the enclosing pnpm-workspace.yaml, and hoisted the
// install away. The installer now delimits the home with a marker at the home
// root (isolation), the pnpm-install step roots its own cwd so the layout
// stays standalone wherever the home sits, and the step verifies its own
// effect instead of trusting exit 0 (self-verification).

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

describe("home workspace marker", () => {
  it("writes a minimal marker at the home root and reports the change", () => {
    vol.fromJSON({ "/home/dsh/.keep": "x" }, "/");
    const fs = createMemfsAPI();
    expect(ensureHomeWorkspaceMarker("/home", fs)).toBe(true);
    expect(fs.readFileSync("/home/pnpm-workspace.yaml", "utf8")).toBe(
      HOME_WORKSPACE_MARKER_CONTENT,
    );
    // Idempotent: the second call changes nothing.
    expect(ensureHomeWorkspaceMarker("/home", fs)).toBe(false);
  });

  it("never overwrites an existing marker", () => {
    vol.fromJSON({ "/home/pnpm-workspace.yaml": 'packages:\n  - "custom"\n' }, "/");
    const fs = createMemfsAPI();
    expect(ensureHomeWorkspaceMarker("/home", fs)).toBe(false);
    expect(fs.readFileSync("/home/pnpm-workspace.yaml", "utf8")).toBe('packages:\n  - "custom"\n');
  });

  it("install() materializes the marker where the home root is first made", async () => {
    vol.fromJSON({}, "/");
    const fs = createMemfsAPI();
    const result = await install([], { thursdayHome: "/home", fs, quiet: true });
    expect(result.problems).toEqual([]);
    expect(fs.readFileSync("/home/pnpm-workspace.yaml", "utf8")).toBe(
      HOME_WORKSPACE_MARKER_CONTENT,
    );
  });

  it("the ignored-builds retry reads a marker-shaped home file and keeps its packages", () => {
    // pnpm writes its allowBuilds placeholders to the workspace ROOT's file,
    // which with the marker in place is the home root. The retry normalizes
    // that file too, and must flip the placeholders without dropping the
    // marker's project list.
    vol.fromJSON(
      {
        "/home/pnpm-workspace.yaml":
          "packages: []\nallowBuilds:\n  koffi: set this to true or false\n",
        "/home/runtime/package.json": "{}\n",
      },
      "/",
    );
    const fs = createMemfsAPI();
    expect(normaliseIgnoredBuilds("/home", false, fs)).toEqual(["koffi"]);
    const doc = parseYaml(fs.readFileSync("/home/pnpm-workspace.yaml", "utf8") as string) as any;
    expect(doc.packages).toEqual([]);
    expect(doc.allowBuilds).toEqual({ koffi: true });
  });

  it("the ignored-builds retry still reads the cwd's own file", () => {
    vol.fromJSON(
      {
        "/home/runtime/pnpm-workspace.yaml": "allowBuilds:\n  koffi: set this to true or false\n",
      },
      "/",
    );
    expect(normaliseIgnoredBuilds("/home/runtime", false, createMemfsAPI())).toEqual(["koffi"]);
  });
});

describe("pnpm-install cwd self-rooting", () => {
  it("roots the cwd with a comment-only file and reports the change", () => {
    vol.fromJSON({ "/home/runtime/package.json": "{}\n" }, "/");
    const fs = createMemfsAPI();
    expect(ensurePnpmInstallRoot("/home/runtime", fs)).toBe(true);
    expect(fs.readFileSync("/home/runtime/pnpm-workspace.yaml", "utf8")).toBe(
      PNPM_INSTALL_ROOT_CONTENT,
    );
    // Idempotent: the second call changes nothing.
    expect(ensurePnpmInstallRoot("/home/runtime", fs)).toBe(false);
  });

  it("never overwrites an existing cwd file — pnpm's placeholders win", () => {
    vol.fromJSON(
      {
        "/home/runtime/pnpm-workspace.yaml": "allowBuilds:\n  koffi: true\n",
      },
      "/",
    );
    const fs = createMemfsAPI();
    expect(ensurePnpmInstallRoot("/home/runtime", fs)).toBe(false);
    expect(fs.readFileSync("/home/runtime/pnpm-workspace.yaml", "utf8")).toBe(
      "allowBuilds:\n  koffi: true\n",
    );
  });
});

describe("pnpm-install self-verification", () => {
  it("passes when node_modules landed in the cwd", () => {
    vol.fromJSON({ "/home/runtime/node_modules/.keep": "x" }, "/");
    expect(() => assertPnpmInstallLanded("/home/runtime", createMemfsAPI())).not.toThrow();
  });

  it("fails loudly naming the hoist and the cwd when nothing landed", () => {
    vol.fromJSON({ "/home/runtime/package.json": "{}\n" }, "/");
    let message = "";
    try {
      assertPnpmInstallLanded("/home/runtime", createMemfsAPI());
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("enclosing pnpm workspace");
    expect(message).toContain("hoist");
    expect(message).toContain("/home/runtime");
  });
});

describe("a home nested inside a synthetic pnpm workspace", () => {
  // The trap, end to end on a real filesystem with a real pnpm: the temp home
  // sits inside an enclosing workspace the way a temp home inside the Thursday
  // checkout does. link: dependencies keep the install offline.

  function syntheticLayout(): { outer: string; home: string; runtime: string } {
    const outer = mkdtempSync(join(realpathSync(tmpdir()), "thursday-ws-outer-"));
    mkdirSync(join(outer, "member"), { recursive: true });
    writeFileSync(join(outer, "pnpm-workspace.yaml"), 'packages:\n  - "member"\n', "utf8");
    writeFileSync(join(outer, "member/package.json"), '{"name":"member","private":true}\n', "utf8");

    const home = join(outer, "nested-home");
    const runtime = join(home, "runtime");
    mkdirSync(join(home, "vendor/mydep"), { recursive: true });
    mkdirSync(runtime, { recursive: true });
    writeFileSync(
      join(home, "vendor/mydep/package.json"),
      '{"name":"mydep","version":"1.0.0","main":"index.js"}\n',
      "utf8",
    );
    writeFileSync(join(home, "vendor/mydep/index.js"), "module.exports = 42;\n", "utf8");
    writeFileSync(
      join(runtime, "package.json"),
      '{"name":"test-runtime","private":true,"dependencies":{"mydep":"link:../vendor/mydep"}}\n',
      "utf8",
    );
    return { outer, home, runtime };
  }

  function pnpmInstallStep(): Step {
    return {
      action: "pnpm-install",
      cwd: "runtime",
      storeDir: "cache/pnpm-store",
      base: "home",
    } as Step;
  }

  it("installs into the home, not the enclosing workspace", async () => {
    const { outer, home, runtime } = syntheticLayout();
    try {
      const fs = createFilesystemAPI();
      expect(ensureHomeWorkspaceMarker(home, fs)).toBe(true);

      const result = await executeStep(
        planned("test", 0, pnpmInstallStep()),
        join(home, "dsh"),
        home,
        fs,
        false,
      );
      expect(result.changed).toBe(true);

      // Installed INTO the home, standalone ...
      expect(existsSync(join(runtime, "node_modules", "mydep"))).toBe(true);
      expect(existsSync(join(runtime, "node_modules", ".pnpm"))).toBe(true);
      // ... the step rooted its own cwd ...
      expect(existsSync(join(runtime, "pnpm-workspace.yaml"))).toBe(true);
      // ... and nothing hoisted into the enclosing workspace.
      expect(existsSync(join(outer, "node_modules"))).toBe(false);
      expect(existsSync(join(outer, "pnpm-lock.yaml"))).toBe(false);
    } finally {
      rmSync(outer, { recursive: true, force: true });
    }
  }, 120000);

  it("the step roots its own cwd even without the home marker", async () => {
    const { outer, home, runtime } = syntheticLayout();
    try {
      const fs = createFilesystemAPI();
      // Deliberately no home marker: the step roots its own cwd, so the
      // install still lands standalone instead of hoisting away.
      const result = await executeStep(
        planned("test", 0, pnpmInstallStep()),
        join(home, "dsh"),
        home,
        fs,
        false,
      );
      expect(result.changed).toBe(true);
      expect(existsSync(join(runtime, "pnpm-workspace.yaml"))).toBe(true);
      expect(existsSync(join(runtime, "node_modules", "mydep"))).toBe(true);
      expect(existsSync(join(runtime, "node_modules", ".pnpm"))).toBe(true);
      expect(existsSync(join(outer, "node_modules"))).toBe(false);
      expect(existsSync(join(outer, "pnpm-lock.yaml"))).toBe(false);
    } finally {
      rmSync(outer, { recursive: true, force: true });
    }
  }, 120000);
});
