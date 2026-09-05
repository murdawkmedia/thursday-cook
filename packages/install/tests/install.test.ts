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
  type FilesystemAPI,
  type ExecutionPlan,
} from "../src/install";
import { parseBlock } from "../src/loader";

/**
 * Create a memfs-based filesystem API for testing.
 * Uses `any` casting to work around memfs type incompatibilities with Node.js fs.
 */
function createMemfsAPI(): FilesystemAPI {
  const mfs = memfsFs as any;
  return {
    existsSync: mfs.existsSync.bind(mfs),
    readFileSync: mfs.readFileSync.bind(mfs),
    writeFileSync: mfs.writeFileSync.bind(mfs),
    mkdirSync: mfs.mkdirSync.bind(mfs),
    promises: {
      readFile: mfs.promises.readFile.bind(mfs.promises),
      writeFile: mfs.promises.writeFile.bind(mfs.promises),
      mkdir: mfs.promises.mkdir.bind(mfs.promises),
      cp: mfs.promises.cp.bind(mfs.promises),
    },
  };
}

describe("resolveThursdayHome", () => {
  it("resolves to $THURSDAY_HOME when set", () => {
    const result = resolveThursdayHome(
      {
        THURSDAY_HOME: "/tmp/test-thursday",
        HOME: "/home/test",
      },
      "/home/test"
    );
    expect(result.path).toBe("/tmp/test-thursday");
    expect(result.dshPath).toBe("/tmp/test-thursday/dsh");
  });

  it("resolves to $HOME/.thursday when $THURSDAY_HOME is unset", () => {
    const result = resolveThursdayHome(
      {
        HOME: "/home/test",
      },
      "/home/test"
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
      "/home/test"
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
        "/home/test"
      )
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
        "/home/test"
      )
    ).toThrow(/cannot overlap/);
  });

  it("refuses if THURSDAY_HOME starts with /mnt/ (WSL rule)", () => {
    expect(() =>
      resolveThursdayHome(
        {
          THURSDAY_HOME: "/mnt/c/thursday",
          HOME: "/home/test",
        },
        "/home/test"
      )
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
        { action: "path-exists", path: "profiles/web/package.json" },
        "/thursday/dsh",
        "/thursday",
        fs
      );
      expect(result).toBe(true);
    });

    it("path-exists: returns false when path does not exist", () => {
      const result = runDetectStep(
        { action: "path-exists", path: "missing/file.txt" },
        "/thursday/dsh",
        "/thursday",
        fs
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
        fs
      );
      expect(result).toBe(true);
    });

    it("package-installed: returns false when package missing", () => {
      const result = runDetectStep(
        { action: "package-installed", name: "missing-pkg", profile: "web" },
        "/thursday/dsh",
        "/thursday",
        fs
      );
      expect(result).toBe(false);
    });

    it("settings-key-equals: returns true when key matches", () => {
      const settingsPath = "/thursday/dsh/settings.yaml";
      fs.mkdirSync("/thursday/dsh", { recursive: true });
      fs.writeFileSync(
        settingsPath,
        "profile:\n  active: web\n  mode: dark"
      );

      const result = runDetectStep(
        {
          action: "settings-key-equals",
          file: "settings.yaml",
          key: "profile.active",
          value: "web",
        },
        "/thursday/dsh",
        "/thursday",
        fs
      );
      expect(result).toBe(true);
    });

    it("settings-key-equals: returns false when key differs", () => {
      const settingsPath = "/thursday/dsh/settings.yaml";
      fs.mkdirSync("/thursday/dsh", { recursive: true });
      fs.writeFileSync(
        settingsPath,
        "profile:\n  active: thursday"
      );

      const result = runDetectStep(
        {
          action: "settings-key-equals",
          file: "settings.yaml",
          key: "profile.active",
          value: "web",
        },
        "/thursday/dsh",
        "/thursday",
        fs
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
        fs
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

describe("Dry-run produces same plan as real run", () => {
  let fs: FilesystemAPI;

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
    fs.mkdirSync("/thursday/dsh", { recursive: true });
  });

  it("dry-run plan matches real run plan", async () => {
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
  - action: path-exists
    path: settings.yaml
---
test body
`);

    const plan = planInstall([block], "/thursday/dsh", "/thursday", fs);

    const dryRunResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: true,
      quiet: true,
      fs,
    });
    const dryRunSteps = dryRunResult.steps.length;

    const realRunResult = await executeInstall(plan, "/thursday/dsh", "/thursday", {
      dryRun: false,
      quiet: true,
      fs,
    });
    const realRunSteps = realRunResult.steps.length;

    expect(dryRunSteps).toBe(realRunSteps);
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
