import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "node:path";
import * as fsDefault from "node:fs";
import * as fsPromisesDefault from "node:fs/promises";
import { fs as memfsFs, vol } from "memfs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  resolveThursdayHome,
  runDetectStep,
  detectBlockStatus,
  planInstall,
  executeInstall,
  createFilesystemAPI,
  ensurePeerAutoInstallOff,
  type FilesystemAPI,
  type ExecutionPlan,
} from "../src/install";
import type { Step } from "../src/actions";
import { parseBlock } from "../src/loader";

/**
 * Create a memfs-based filesystem API for testing.
 * Uses `any` casting to work around memfs type incompatibilities with Node.js fs.
 *
 * Every member is bound to the real memfs implementation, never stubbed. The
 * `patch-file-exact` guards are built out of `realpathSync` (symlink escape),
 * `renameSync` (hardlink break) and `unlinkSync` (temp-file cleanup on a failed
 * patch); a fake that answered those calls with a no-op would make the guard
 * tests assert nothing. memfs implements all five against its in-memory volume,
 * including symlink resolution, so the guards are exercised for real here.
 */
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

describe("ensurePeerAutoInstallOff", () => {
  beforeEach(() => vol.reset());
  afterEach(() => vol.reset());

  it("creates a missing workspace file with the key off", () => {
    const fs = createMemfsAPI();
    fs.mkdirSync("/home/profiles/web", { recursive: true });
    expect(ensurePeerAutoInstallOff("/home/profiles/web", fs)).toBe(true);
    const doc = parseYaml(
      fs.readFileSync("/home/profiles/web/pnpm-workspace.yaml", "utf8") as string,
    ) as Record<string, unknown>;
    expect(doc.autoInstallPeers).toBe(false);
  });

  it("leaves an explicit value untouched", () => {
    vol.fromJSON(
      { "/home/profiles/web/pnpm-workspace.yaml": "autoInstallPeers: true\noverrides: {}\n" },
      "/",
    );
    const fs = createMemfsAPI();
    expect(ensurePeerAutoInstallOff("/home/profiles/web", fs)).toBe(false);
    const doc = parseYaml(
      fs.readFileSync("/home/profiles/web/pnpm-workspace.yaml", "utf8") as string,
    ) as Record<string, unknown>;
    expect(doc.autoInstallPeers).toBe(true);
    expect(doc.overrides).toEqual({});
  });

  it("adds the key without dropping keys already in the file", () => {
    vol.fromJSON(
      { "/home/profiles/web/pnpm-workspace.yaml": "overrides:\n  foo: 1.0.0\n" },
      "/",
    );
    const fs = createMemfsAPI();
    expect(ensurePeerAutoInstallOff("/home/profiles/web", fs)).toBe(true);
    const doc = parseYaml(
      fs.readFileSync("/home/profiles/web/pnpm-workspace.yaml", "utf8") as string,
    ) as Record<string, unknown>;
    expect(doc.autoInstallPeers).toBe(false);
    expect(doc.overrides).toEqual({ foo: "1.0.0" });
  });
});

describe("resolveThursdayHome", () => {
  it("resolves to $THURSDAY_HOME when set", () => {
    const result = resolveThursdayHome(
      {
        THURSDAY_HOME: "/tmp/test-thursday",
        HOME: "/home/test",
      },
      "/home/test",
    );
    expect(result.path).toBe("/tmp/test-thursday");
    expect(result.dshPath).toBe("/tmp/test-thursday/dsh");
  });

  it("resolves to $HOME/.thursday when $THURSDAY_HOME is unset", () => {
    const result = resolveThursdayHome(
      {
        HOME: "/home/test",
      },
      "/home/test",
    );
    expect(result.path).toBe("/home/test/.thursday");
    expect(result.dshPath).toBe("/home/test/.thursday/dsh");
  });

  it("expands ~ in $THURSDAY_HOME", () => {
    const result = resolveThursdayHome(
      {
        THURSDAY_HOME: "~/my-thursday",
        HOME: "/home/test",
      },
      "/home/test",
    );
    expect(result.path).toBe("/home/test/my-thursday");
  });

  it("refuses if THURSDAY_HOME overlaps with user's DSH_HOME", () => {
    expect(() =>
      resolveThursdayHome(
        {
          THURSDAY_HOME: "/home/test/.dsh",
          DSH_HOME: "/home/test/.dsh",
          HOME: "/home/test",
        },
        "/home/test",
      ),
    ).toThrow(/cannot overlap/);
  });

  it("refuses if THURSDAY_HOME is inside user's DSH_HOME", () => {
    expect(() =>
      resolveThursdayHome(
        {
          THURSDAY_HOME: "/home/test/.dsh/thursday",
          DSH_HOME: "/home/test/.dsh",
          HOME: "/home/test",
        },
        "/home/test",
      ),
    ).toThrow(/cannot overlap/);
  });

  it("refuses if THURSDAY_HOME starts with /mnt/ (WSL rule)", () => {
    expect(() =>
      resolveThursdayHome(
        {
          THURSDAY_HOME: "/mnt/c/thursday",
          HOME: "/home/test",
        },
        "/home/test",
      ),
    ).toThrow(/WSL DrvFs/);
  });
});

describe("Detection with memfs fake filesystem", () => {
  let fs: FilesystemAPI;

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
  });

  describe("runDetectStep", () => {
    it("path-exists: returns true when path exists", () => {
      const filePath = "/thursday/dsh/profiles/web/package.json";
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "{}");

      const result = runDetectStep(
        { action: "path-exists", path: "profiles/web/package.json", base: "dsh" },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(true);
    });

    it("path-exists: returns false when path does not exist", () => {
      const result = runDetectStep(
        { action: "path-exists", path: "missing/file.txt", base: "dsh" },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(false);
    });

    it("package-installed: returns true when package exists", () => {
      const pkgPath = "/thursday/dsh/profiles/web/node_modules/@example/pkg";
      fs.mkdirSync(pkgPath, { recursive: true });
      fs.writeFileSync(join(pkgPath, "package.json"), "{}");

      const result = runDetectStep(
        { action: "package-installed", name: "@example/pkg", profile: "web" },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(true);
    });

    it("package-installed: returns false when package missing", () => {
      const result = runDetectStep(
        { action: "package-installed", name: "missing-pkg", profile: "web" },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(false);
    });

    it("settings-key-equals: returns true when key matches", () => {
      const settingsPath = "/thursday/dsh/settings.yaml";
      fs.mkdirSync("/thursday/dsh", { recursive: true });
      fs.writeFileSync(settingsPath, "profile:\n  active: web\n  mode: dark");

      const result = runDetectStep(
        {
          action: "settings-key-equals",
          file: "settings.yaml",
          key: "profile.active",
          value: "web",
        },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(true);
    });

    it("settings-key-equals: returns false when key differs", () => {
      const settingsPath = "/thursday/dsh/settings.yaml";
      fs.mkdirSync("/thursday/dsh", { recursive: true });
      fs.writeFileSync(settingsPath, "profile:\n  active: thursday");

      const result = runDetectStep(
        {
          action: "settings-key-equals",
          file: "settings.yaml",
          key: "profile.active",
          value: "web",
        },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(false);
    });

    it("settings-key-equals: returns false when file missing", () => {
      const result = runDetectStep(
        {
          action: "settings-key-equals",
          file: "settings.yaml",
          key: "profile.active",
          value: "web",
        },
        "/thursday/dsh",
        "/thursday",
        fs,
      );
      expect(result).toBe(false);
    });
  });

  describe("detectBlockStatus", () => {
    it("returns not-installed when detect steps fail", () => {
      const block = parseBlock(`---
id: test-block
version: 1
rationale: test block
steps:
  - action: write-settings-key
    key: test
    value: true
detect:
  - action: path-exists
    path: test.txt
---
test body
`);

      const status = detectBlockStatus(block, "/thursday/dsh", "/thursday", fs);
      expect(status.status).toBe("not-installed");
      expect(status.shouldInstall).toBe(true);
    });

    it("returns installed-and-current when all detect steps pass", () => {
      const filePath = "/thursday/dsh/test.txt";
      fs.mkdirSync("/thursday/dsh", { recursive: true });
      fs.writeFileSync(filePath, "test");

      const block = parseBlock(`---
id: test-block
version: 1
rationale: test block
steps:
  - action: write-settings-key
    key: test
    value: true
detect:
  - action: path-exists
    path: test.txt
---
test body
`);

      const status = detectBlockStatus(block, "/thursday/dsh", "/thursday", fs);
      expect(status.status).toBe("installed-and-current");
      expect(status.shouldInstall).toBe(false);
    });
  });
});

describe("Idempotence with memfs", () => {
  let fs: FilesystemAPI;

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
    fs.mkdirSync("/thursday/dsh", { recursive: true });
  });

  it("write-settings-key is idempotent", async () => {
    const block = parseBlock(`---
id: settings-block
version: 1
rationale: sets settings
steps:
  - action: write-settings-key
    file: settings.yaml
    key: profile.active
    value: web
detect:
  - action: settings-key-equals
    file: settings.yaml
    key: profile.active
    value: web
---
test body
`);

    const plan1: ExecutionPlan = {
      steps: [
        {
          blockId: block.frontmatter.id,
          blockRationale: block.frontmatter.rationale,
          index: 0,
          step: block.frontmatter.steps[0],
          dryRun: false,
        },
      ],
      problems: [],
    };

    const result1 = await executeInstall(plan1, "/thursday/dsh", "/thursday", {
      quiet: true,
      fs,
    });
    expect(result1.anyChanged).toBe(true);
    expect(result1.problems).toHaveLength(0);

    const plan2 = planInstall([block], "/thursday/dsh", "/thursday", fs);
    const result2 = await executeInstall(plan2, "/thursday/dsh", "/thursday", {
      quiet: true,
      fs,
    });
    expect(result2.steps).toHaveLength(0);
    expect(result2.anyChanged).toBe(false);
  });
});

describe("the memfs fake really implements what the guards call", () => {
  let fs: FilesystemAPI;

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
  });

  /**
   * `patch-file-exact` is built out of realpathSync (symlink escape),
   * renameSync (hardlink break) and unlinkSync (temp cleanup). Stubbing those
   * on the fake would make every guard test in this repo vacuous, so this case
   * drives them through the real executor: it fails if any of the three is
   * replaced by a no-op.
   */
  const patchStep = {
    action: "patch-file-exact",
    target: "runtime/lib/index.js",
    storageKey: "demo",
    base: "home",
    replacements: [{ find: "const a = 1;", replace: "const a = 2;" }],
  } as const;

  const plannedPatch = {
    blockId: "demo",
    blockRationale: "demo",
    index: 0,
    step: patchStep as unknown as Step,
    dryRun: false,
  };

  it("renameSync and realpathSync carry a real patch through", async () => {
    fs.mkdirSync("/thursday/runtime/lib", { recursive: true });
    fs.writeFileSync("/thursday/runtime/lib/index.js", "const a = 1;\n", "utf8");

    const result = await executeInstall(
      { steps: [plannedPatch], problems: [] },
      "/thursday/dsh",
      "/thursday",
      { quiet: true, fs },
    );

    expect(result.problems).toEqual([]);
    expect(result.steps[0].changed).toBe(true);
    // renameSync moved the temp file over the target, and unlinkSync had
    // nothing to clean up because the write succeeded
    expect(fs.readFileSync("/thursday/runtime/lib/index.js", "utf8").toString()).toBe(
      "const a = 2;\n",
    );
    expect(fs.existsSync("/thursday/runtime/lib/index.js.thursday-patch-tmp")).toBe(false);
    expect(fs.readFileSync("/thursday/state/demo.orig", "utf8").toString()).toBe("const a = 1;\n");
  });

  it("realpathSync resolves a symlink, so the escape guard sees the real target", async () => {
    fs.mkdirSync("/thursday/runtime/lib", { recursive: true });
    fs.mkdirSync("/elsewhere", { recursive: true });
    fs.writeFileSync("/elsewhere/index.js", "const a = 1;\n", "utf8");
    (memfsFs as any).symlinkSync("/elsewhere/index.js", "/thursday/runtime/lib/index.js");

    const result = await executeInstall(
      { steps: [plannedPatch], problems: [] },
      "/thursday/dsh",
      "/thursday",
      { quiet: true, fs },
    );

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].message).toMatch(/outside THURSDAY_HOME/);
    // the file outside the home is untouched
    expect(fs.readFileSync("/elsewhere/index.js", "utf8").toString()).toBe("const a = 1;\n");
  });
});

describe("Dry-run produces same plan as real run", () => {
  let fs: FilesystemAPI;

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
    fs.mkdirSync("/thursday/dsh", { recursive: true });
  });

  it("dry-run reports same changed/output as apply", async () => {
    const block = parseBlock(`---
id: test-block
version: 1
rationale: test block
steps:
  - action: write-settings-key
    file: settings.yaml
    key: profile.active
    value: web
detect:
  - action: settings-key-equals
    file: settings.yaml
    key: profile.active
    value: web
---
test body
`);

    const plan = planInstall([block], "/thursday/dsh", "/thursday", fs);
    expect(plan.steps.length).toBeGreaterThan(0);

    const dryRunResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: true,
      quiet: true,
      fs,
    });

    // A dry run must not have written anything, so the file it would create is
    // still absent. Reading it here (as an earlier revision of this test did)
    // only passed while dry-run wrote for real.
    expect(fs.existsSync("/thursday/dsh/settings.yaml")).toBe(false);

    const realRunResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: false,
      quiet: true,
      fs,
    });

    // Verify same number of steps
    expect(dryRunResult.steps.length).toBe(realRunResult.steps.length);

    // Verify same changed flags
    for (let i = 0; i < dryRunResult.steps.length; i++) {
      expect(dryRunResult.steps[i].changed).toBe(realRunResult.steps[i].changed);
      // Output should be identical between dry-run and apply
      expect(dryRunResult.steps[i].output).toBe(realRunResult.steps[i].output);
    }

    // Verify anyChanged matches
    expect(dryRunResult.anyChanged).toBe(realRunResult.anyChanged);
  });

  it("dry-run leaves filesystem unchanged", async () => {
    const block = parseBlock(`---
id: test-block
version: 1
rationale: test block
steps:
  - action: write-file
    path: newfile.txt
    content: "brand new content"
detect:
  - action: path-exists
    path: newfile.txt
---
test body
`);

    const plan = planInstall([block], "/thursday/dsh", "/thursday", fs);
    expect(plan.steps.length).toBeGreaterThan(0);

    // `write-file` resolves `path` against `base`, which defaults to "home" —
    // the Thursday home, not the dsh home under it. So this step's target is
    // /thursday/newfile.txt. Asserting the dsh-home path instead would make the
    // test pass for the wrong reason once and fail the moment the write works.
    const target = "/thursday/newfile.txt";

    // Verify file doesn't exist before dry run
    expect(fs.existsSync(target)).toBe(false);

    // Run dry run
    const dryRunResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: true,
      quiet: true,
      fs,
    });
    expect(dryRunResult.anyChanged).toBe(true);

    // Verify file still doesn't exist after dry run
    expect(fs.existsSync(target)).toBe(false);

    // Now run for real
    const realResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: false,
      quiet: true,
      fs,
    });
    expect(realResult.anyChanged).toBe(true);

    // Now file should exist, with the content the step asked for
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf8").toString()).toBe("brand new content");
    // ...and nothing was written under the dsh home, which is a different root
    expect(fs.existsSync("/thursday/dsh/newfile.txt")).toBe(false);
  });

  it("third run after real run produces no changes", async () => {
    const block = parseBlock(`---
id: test-block
version: 1
rationale: test block
steps:
  - action: write-settings-key
    file: settings.yaml
    key: profile.active
    value: web
detect:
  - action: settings-key-equals
    file: settings.yaml
    key: profile.active
    value: web
---
test body
`);

    const plan1 = planInstall([block], "/thursday/dsh", "/thursday", fs);
    expect(plan1.steps.length).toBeGreaterThan(0);

    const result1 = await executeInstall(plan1, "/thursday/dsh", "/thursday", {
      quiet: true,
      fs,
    });
    expect(result1.anyChanged).toBe(true);

    const plan2 = planInstall([block], "/thursday/dsh", "/thursday", fs);
    expect(plan2.steps).toHaveLength(0);

    const result2 = await executeInstall(plan2, "/thursday/dsh", "/thursday", {
      quiet: true,
      fs,
    });
    expect(result2.anyChanged).toBe(false);

    const plan3 = planInstall([block], "/thursday/dsh", "/thursday", fs);
    expect(plan3.steps).toHaveLength(0);

    const result3 = await executeInstall(plan3, "/thursday/dsh", "/thursday", {
      quiet: true,
      fs,
    });
    expect(result3.anyChanged).toBe(false);
  });
});
