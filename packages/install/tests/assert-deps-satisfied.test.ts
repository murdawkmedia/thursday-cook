import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import { fs as memfsFs, vol } from "memfs";

import { INSTALL_ACTIONS, type Step } from "../src/actions";
import {
  checkDepsSatisfied,
  executeStep,
  type FilesystemAPI,
  type PlannedStep,
} from "../src/install";
import { loadBlockFile } from "../src/loader";

/**
 * Create a memfs-based filesystem API for testing.
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

const DSH_PATH = "/home/dsh";
const DEP = "@deepseek-ai/dsh-tools";

type AssertStep = Extract<Step, { action: "assert-deps-satisfied" }>;

const pkg = (name: string, version: string, deps?: Record<string, string>): string =>
  JSON.stringify({
    name,
    version,
    ...(deps === undefined ? {} : { dependencies: deps }),
  });

/** Populate memfs with a fixture profile node_modules and return the fs API. */
function fixture(
  packages: Record<string, { version: string; deps?: Record<string, string> }>,
): FilesystemAPI {
  vol.reset();
  const files: Record<string, string> = {};
  for (const [name, p] of Object.entries(packages)) {
    files[`${DSH_PATH}/profiles/web/node_modules/${name}/package.json`] = pkg(
      name,
      p.version,
      p.deps,
    );
  }
  vol.fromJSON(files, "/");
  return createMemfsAPI();
}

const step = (dependents: string[]): AssertStep => ({
  action: "assert-deps-satisfied",
  name: DEP,
  dependents,
  profile: "web",
});

describe("assert-deps-satisfied action definition", () => {
  it("is registered in INSTALL_ACTIONS", () => {
    expect(INSTALL_ACTIONS["assert-deps-satisfied"]).toBeDefined();
  });

  it("requires dependents and applies the web profile default", () => {
    const parsed = INSTALL_ACTIONS["assert-deps-satisfied"].params.parse({
      name: DEP,
      dependents: ["@deepseek-ai/dsh-tool-calculator"],
    }) as AssertStep;
    expect(parsed.profile).toBe("web");
    expect(() =>
      INSTALL_ACTIONS["assert-deps-satisfied"].params.parse({ name: DEP, dependents: [] }),
    ).toThrow();
  });
});

describe("checkDepsSatisfied", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("reports zero problems when every dependent's range is satisfied", () => {
    const fs = fixture({
      [DEP]: { version: "0.1.0-rc.8" },
      // A prerelease lower bound: satisfied ONLY with includePrerelease, which
      // is the flag the implementation must pass (without it this is false).
      "@deepseek-ai/dsh-tool-calculator": { version: "1.0.0", deps: { [DEP]: ">=0.0.1-rc.1" } },
      "@deepseek-ai/dsh-tool-diff": { version: "1.0.0", deps: { [DEP]: "^0.1.0-rc.1" } },
    });
    expect(
      checkDepsSatisfied(
        step(["@deepseek-ai/dsh-tool-calculator", "@deepseek-ai/dsh-tool-diff"]),
        DSH_PATH,
        fs,
      ),
    ).toEqual([]);
  });

  it("reports a problem naming dependent, range and installed version when excluded", () => {
    const fs = fixture({
      [DEP]: { version: "0.1.0-rc.8" },
      "@deepseek-ai/dsh-tool-time": { version: "1.0.0", deps: { [DEP]: ">=0.2.0" } },
    });
    const problems = checkDepsSatisfied(step(["@deepseek-ai/dsh-tool-time"]), DSH_PATH, fs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@deepseek-ai/dsh-tool-time");
    expect(problems[0]).toContain(">=0.2.0");
    expect(problems[0]).toContain("0.1.0-rc.8");
  });

  it("reports a problem when a dependent omits the dependency entirely", () => {
    const fs = fixture({
      [DEP]: { version: "0.1.0-rc.8" },
      "@deepseek-ai/dsh-tool-regex": { version: "1.0.0" },
    });
    const problems = checkDepsSatisfied(step(["@deepseek-ai/dsh-tool-regex"]), DSH_PATH, fs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@deepseek-ai/dsh-tool-regex");
  });

  it("reports a problem rather than crashing when the dependency is not installed", () => {
    const fs = fixture({
      "@deepseek-ai/dsh-tool-markdown": { version: "1.0.0", deps: { [DEP]: ">=0.0.1-rc.1" } },
    });
    const problems = checkDepsSatisfied(step(["@deepseek-ai/dsh-tool-markdown"]), DSH_PATH, fs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(DEP);
  });
});

describe("assert-deps-satisfied execution", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("fails the step even in a dry run: verification is read-only so it runs for real", async () => {
    const fs = fixture({
      [DEP]: { version: "0.1.0-rc.8" },
      "@deepseek-ai/dsh-tool-encoding": { version: "1.0.0", deps: { [DEP]: ">=0.2.0" } },
    });
    const planned: PlannedStep = {
      blockId: "util-tools",
      blockRationale: "fixture",
      index: 7,
      step: step(["@deepseek-ai/dsh-tool-encoding"]),
      dryRun: true,
    };
    await expect(executeStep(planned, DSH_PATH, "/home", fs, true)).rejects.toThrow(
      "@deepseek-ai/dsh-tool-encoding",
    );
  });

  it("succeeds with changed=false when satisfied", async () => {
    const fs = fixture({
      [DEP]: { version: "0.1.0-rc.8" },
      "@deepseek-ai/dsh-tool-encoding": { version: "1.0.0", deps: { [DEP]: ">=0.0.1-rc.1" } },
    });
    const planned: PlannedStep = {
      blockId: "util-tools",
      blockRationale: "fixture",
      index: 7,
      step: step(["@deepseek-ai/dsh-tool-encoding"]),
      dryRun: true,
    };
    const result = await executeStep(planned, DSH_PATH, "/home", fs, true);
    expect(result.changed).toBe(false);
  });
});

describe("util-tools block", () => {
  const BLOCK = fileURLToPath(new URL("../../blocks/util-tools.md", import.meta.url));

  it("still schema-loads with the assert-deps-satisfied step", () => {
    const block = loadBlockFile(BLOCK);
    const assertStep = block.frontmatter.steps.find((s) => s.action === "assert-deps-satisfied") as
      AssertStep | undefined;
    expect(assertStep).toBeDefined();
    expect(assertStep?.name).toBe(DEP);
    expect(assertStep?.dependents).toHaveLength(6);
  });

  it("the assert step carries no version string: the pin lives in the pnpm-add step only", () => {
    const block = loadBlockFile(BLOCK);
    const assertStep = block.frontmatter.steps.find((s) => s.action === "assert-deps-satisfied") as
      AssertStep | undefined;
    expect(JSON.stringify(assertStep)).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
