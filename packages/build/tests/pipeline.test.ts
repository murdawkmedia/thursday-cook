import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLIENT_EXTERNAL,
  CREATE_REQUIRE_BANNER,
  HOST_EXTERNAL,
  assertNoAutomaticJsxRuntime,
  buildPackage,
  checkDrift,
  clientBuildOptions,
  hostBuildOptions,
  wrapModuleLoaderFacade,
} from "../src/index.js";

const pkgRoot = resolve(import.meta.dirname, "..");

describe("externals", () => {
  it("keeps bare react-dom external, not only react-dom/client", () => {
    // A second copy of react-dom is ~130 KB; the loader supplies it and four
    // shipped dsh bundles already require it by the bare specifier.
    expect(CLIENT_EXTERNAL).toContain("react-dom");
    expect(CLIENT_EXTERNAL).toContain("react-dom/client");
  });

  it("merges spec externals with the defaults instead of replacing them", () => {
    const options = hostBuildOptions(
      { entry: "a.ts", outfile: "a.js", external: ["lz4"] },
      { root: pkgRoot },
    );
    expect(options.external).toEqual([...HOST_EXTERNAL, "lz4"]);
  });
});

describe("host options", () => {
  it("emits node ESM with the dsh packages external", () => {
    const options = hostBuildOptions({ entry: "a.ts", outfile: "a.js" }, { root: pkgRoot });
    expect(options.platform).toBe("node");
    expect(options.format).toBe("esm");
    expect(options.external).toEqual([...HOST_EXTERNAL]);
    expect(options.banner).toBeUndefined();
  });

  it("injects the createRequire banner only when asked", () => {
    const options = hostBuildOptions(
      { entry: "a.ts", outfile: "a.js", requireShim: true },
      { root: pkgRoot },
    );
    expect(options.banner?.js).toBe(CREATE_REQUIRE_BANNER);
  });
});

describe("client options", () => {
  it("uses cjs for the facade shape and iife for the self-loading shape", () => {
    const ctx = { root: pkgRoot };
    expect(
      clientBuildOptions({ entry: "a.tsx", outfile: "a.js", id: "a" }, ctx, "o.js").format,
    ).toBe("cjs");
    expect(
      clientBuildOptions({ entry: "a.tsx", outfile: "a.js", id: "a", wrapper: "iife" }, ctx, "o.js")
        .format,
    ).toBe("iife");
  });

  it("pins the classic JSX factory against a react-jsx tsconfig", () => {
    const options = clientBuildOptions(
      { entry: "a.tsx", outfile: "a.js", id: "a" },
      { root: pkgRoot },
      "o.js",
    );
    expect(options.jsxFactory).toBe("react.createElement");
    expect(options.tsconfigRaw).toBeDefined();
  });

  it("rejects a bundle that reached for the automatic runtime", () => {
    expect(() => assertNoAutomaticJsxRuntime('require("react/jsx-runtime")', "a.tsx")).toThrow(
      /automatic JSX runtime/,
    );
  });
});

describe("module-loader facade", () => {
  it("stamps Symbol.toStringTag around the CJS body", () => {
    const wrapped = wrapModuleLoaderFacade("demo", "module.exports = 1;");
    expect(wrapped).toContain('id: "demo"');
    expect(wrapped).toContain(
      'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    );
    expect(wrapped.startsWith("window.__ModuleLoader__.load({\n\tid:")).toBe(true);
    expect(wrapped.trimEnd().endsWith("});")).toBe(true);
  });
});

describe("fixtures", () => {
  it("builds both halves with the right shapes", async () => {
    const spec = (await import("../build.config.mjs")).default;
    await buildPackage({ ...spec, logLevel: "silent" });
    const host = await readFile(join(pkgRoot, "fixtures/dist/host.js"), "utf8");
    expect(host).toContain('import { readFile } from "node:fs/promises";');
    expect(host).toContain('import { something } from "@deepseek-ai/dsh-core";');
    expect(host).toContain("hello ${who}"); // the local dep was bundled in
    const shim = await readFile(join(pkgRoot, "fixtures/dist/host-require-shim.js"), "utf8");
    expect(shim.startsWith(CREATE_REQUIRE_BANNER)).toBe(true);
    const client = await readFile(join(pkgRoot, "fixtures/dist/client.js"), "utf8");
    expect(client).toContain("Symbol.toStringTag");
    expect(client).toContain("react.createElement");
    expect(client).not.toContain("react/jsx-runtime");
    const iife = await readFile(join(pkgRoot, "fixtures/dist/client-iife.js"), "utf8");
    expect(iife).not.toContain("Symbol.toStringTag");
    expect(iife).toContain("window.__ModuleLoader__.load");
  });
});

describe("drift check", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "thursday-drift-"));
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    await writeFile(join(repo, "bundle.js"), "committed\n");
    git("add", "-A");
    git("commit", "-qm", "bundle");
  });
  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("passes when the committed bundle matches", () => {
    const result = checkDrift([join(repo, "bundle.js")], repo);
    expect(result.clean).toBe(true);
    expect(result.tracked).toEqual(["bundle.js"]);
    expect(result.summary).toContain("no drift");
  });

  it("fails when a fresh build changed the committed bundle", async () => {
    await writeFile(join(repo, "bundle.js"), "rebuilt\n");
    const result = checkDrift([join(repo, "bundle.js")], repo);
    expect(result.clean).toBe(false);
    expect(result.diff).toContain("-committed");
    expect(result.diff).toContain("+rebuilt");
    git("checkout", "--", "bundle.js");
  });

  it("reports vacuous rather than green for untracked outputs", () => {
    const result = checkDrift([join(repo, "never-committed.js")], repo);
    expect(result.clean).toBe(true);
    expect(result.tracked).toEqual([]);
    expect(result.summary).toContain("vacuous");
  });
});
