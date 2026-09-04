import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { build } from "esbuild";
import type { BuildOptions } from "esbuild";
import { cssTextPlugin } from "./css-text.js";
import type { BuildOutput, ClientBuild } from "./spec.js";
import { CLIENT_EXTERNAL } from "./spec.js";

export interface ClientBuildContext {
  root: string;
  name?: string;
  logLevel?: BuildOptions["logLevel"];
}

function at(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

/**
 * The JSX settings a client half must compile with, expressed as a tsconfig
 * because that is the only level esbuild lets us pin them at (see
 * {@link clientBuildOptions}). Identical to the workspace's
 * tsconfig.client.json.
 */
export const CLIENT_TSCONFIG_RAW = {
  compilerOptions: {
    jsx: "react",
    jsxFactory: "react.createElement",
    jsxFragmentFactory: "react.Fragment",
  },
} as const;

/**
 * The module-loader facade.
 *
 * Kept byte-for-byte identical to the template in dotfiles-ai/build.mjs,
 * tabs included, so bundles rebuilt through this module do not show up as
 * drift against the ones already committed there. The three lines inside
 * `factory` supply the `module`/`exports` bindings esbuild's CJS output
 * expects; `Symbol.toStringTag` makes the returned object look like an ES
 * module namespace, which is the shape the loader accepts.
 */
export function wrapModuleLoaderFacade(id: string, bundled: string): string {
  return `window.__ModuleLoader__.load({
\tid: "${id}",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${bundled}
\t\treturn module.exports;
\t}
});
`;
}

/**
 * Shared CLIENT esbuild options: browser CJS at es2022, react and the
 * @deepseek-ai packages external, JSX transformed to the lowercase `react`
 * global that dsh injects into the page (there is no importable react module
 * in the browser module table), `.css` imports turned into strings.
 *
 * The tsconfig handling is NOT cosmetic and is new relative to
 * dotfiles-ai/build.mjs. esbuild lets a discovered tsconfig.json override the
 * `jsx`/`jsxFactory`/`jsxFragment` BUILD options, silently. This workspace's
 * root tsconfig.json sets `"jsx": "react-jsx"` (correct for ordinary TS
 * checking), so a client half built here compiled to the AUTOMATIC runtime
 * and emitted `require("react/jsx-runtime")` — a module the browser loader
 * cannot supply — instead of `react.createElement`. Verified empirically:
 * with the discovered tsconfig the output is `import_jsx_runtime.jsx(...)`,
 * and only pinning the tsconfig produces `react.createElement(...)`.
 *
 * So by default the JSX settings are pinned with `tsconfigRaw`. That has a
 * cost, also verified: `tsconfigRaw` replaces tsconfig discovery entirely, so
 * `paths` aliases stop resolving. A package that needs `paths` sets
 * `tsconfig` on its client spec, pointing at a tsconfig whose `jsx` is
 * `"react"` — the workspace's tsconfig.client.json is exactly that file.
 */
export function clientBuildOptions(
  spec: ClientBuild,
  ctx: ClientBuildContext,
  outfile: string,
): BuildOptions {
  const wrapper = spec.wrapper ?? "module-loader";
  return {
    entryPoints: [at(ctx.root, spec.entry)],
    // See hostBuildOptions: pins the paths esbuild embeds as comments so the
    // output is byte-reproducible no matter which directory the build ran in.
    absWorkingDir: ctx.root,
    bundle: true,
    platform: "browser",
    // The facade form needs CJS: the bundle body is spliced inside a factory
    // that hands it `module`/`exports`/`require`. The IIFE form calls
    // window.__ModuleLoader__.load itself, so it needs no bindings at all.
    format: wrapper === "iife" ? "iife" : "cjs",
    target: "es2022",
    external: [...CLIENT_EXTERNAL, ...(spec.external ?? [])],
    jsx: "transform",
    jsxFactory: "react.createElement",
    jsxFragment: "react.Fragment",
    ...(spec.tsconfig
      ? { tsconfig: at(ctx.root, spec.tsconfig) }
      : { tsconfigRaw: CLIENT_TSCONFIG_RAW }),
    plugins: [cssTextPlugin],
    outfile,
    logLevel: ctx.logLevel ?? "info",
    ...spec.esbuild,
  };
}

/**
 * Fail loudly on the automatic JSX runtime.
 *
 * `external: ["react"]` also externalises react subpaths, so an accidentally
 * automatic build does not error at bundle time — it produces a bundle that
 * requires `react/jsx-runtime` and only fails in the browser, at load, with
 * no useful message. This turns that into a build error naming the fix.
 */
export function assertNoAutomaticJsxRuntime(code: string, entry: string): void {
  if (!code.includes("react/jsx-runtime")) return;
  throw new Error(
    `client bundle for ${entry} requires "react/jsx-runtime": it was compiled with the ` +
      "automatic JSX runtime, which the dsh browser module loader cannot resolve. A " +
      'tsconfig with "jsx": "react-jsx" reached the build and overrode jsxFactory. Remove ' +
      "the client spec's `tsconfig` override, or point it at a tsconfig whose `jsx` is " +
      '"react" with jsxFactory "react.createElement".',
  );
}

/**
 * Build one CLIENT half.
 *
 * `module-loader` bundles to a temp file first, then writes the facade around
 * it. `iife` writes esbuild's output straight to the final path.
 */
export async function buildClient(
  spec: ClientBuild,
  ctx: ClientBuildContext,
): Promise<BuildOutput> {
  const wrapper = spec.wrapper ?? "module-loader";
  const outPath = at(ctx.root, spec.outfile);
  const entry = at(ctx.root, spec.entry);
  await mkdir(dirname(outPath), { recursive: true });

  if (wrapper === "iife") {
    await build(clientBuildOptions(spec, ctx, outPath));
    assertNoAutomaticJsxRuntime(await readFile(outPath, "utf8"), entry);
  } else {
    const tmpDir = await mkdtemp(join(tmpdir(), "dsh-wrap-"));
    const bundlePath = join(tmpDir, "_client.bundle.js");
    try {
      await build(clientBuildOptions(spec, ctx, bundlePath));
      const bundled = (await readFile(bundlePath, "utf8")).replace(/\s+$/, "");
      assertNoAutomaticJsxRuntime(bundled, entry);
      await writeFile(outPath, wrapModuleLoaderFacade(spec.id, bundled));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  return {
    half: "client",
    name: ctx.name ?? spec.id,
    entry,
    outfile: outPath,
    bytes: (await stat(outPath)).size,
  };
}
