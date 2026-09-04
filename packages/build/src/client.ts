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
 */
export function clientBuildOptions(
  spec: ClientBuild,
  ctx: ClientBuildContext,
  outfile: string,
): BuildOptions {
  const wrapper = spec.wrapper ?? "module-loader";
  return {
    entryPoints: [at(ctx.root, spec.entry)],
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
    plugins: [cssTextPlugin],
    outfile,
    logLevel: ctx.logLevel ?? "info",
    ...spec.esbuild,
  };
}

/**
 * Build one CLIENT half.
 *
 * `module-loader` bundles to a temp file first, then writes the facade around
 * it. `iife` writes esbuild's output straight to the final path.
 */
export async function buildClient(spec: ClientBuild, ctx: ClientBuildContext): Promise<BuildOutput> {
  const wrapper = spec.wrapper ?? "module-loader";
  const outPath = at(ctx.root, spec.outfile);
  await mkdir(dirname(outPath), { recursive: true });

  if (wrapper === "iife") {
    await build(clientBuildOptions(spec, ctx, outPath));
  } else {
    const tmpDir = await mkdtemp(join(tmpdir(), "dsh-wrap-"));
    const bundlePath = join(tmpDir, "_client.bundle.js");
    try {
      await build(clientBuildOptions(spec, ctx, bundlePath));
      const bundled = (await readFile(bundlePath, "utf8")).replace(/\s+$/, "");
      await writeFile(outPath, wrapModuleLoaderFacade(spec.id, bundled));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  return {
    half: "client",
    name: ctx.name ?? spec.id,
    entry: at(ctx.root, spec.entry),
    outfile: outPath,
    bytes: (await stat(outPath)).size,
  };
}
