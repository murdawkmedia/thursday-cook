import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { build } from "esbuild";
import type { BuildOptions } from "esbuild";
import type { BuildOutput, HostBuild } from "./spec.js";
import { CREATE_REQUIRE_BANNER, HOST_EXTERNAL } from "./spec.js";

export interface HostBuildContext {
  /** Directory relative paths resolve against. */
  root: string;
  /** Name recorded on the result. */
  name?: string;
  logLevel?: BuildOptions["logLevel"];
}

function at(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

/**
 * Compose the esbuild options for a HOST half without running esbuild.
 * Exported so a caller can inspect or assert on them (and so the drift check
 * and the tests do not have to shell out to reproduce them).
 */
export function hostBuildOptions(spec: HostBuild, ctx: HostBuildContext): BuildOptions {
  const banner = [spec.requireShim ? CREATE_REQUIRE_BANNER : "", spec.banner ?? ""]
    .filter((part) => part.length > 0)
    .join("\n");

  const options: BuildOptions = {
    entryPoints: [at(ctx.root, spec.entry)],
    // Pin esbuild's working directory to the spec root. Not in the original,
    // and load-bearing for the drift check: esbuild writes each module's path
    // into the output as a `// path/to/file.ts` comment, RELATIVE to its
    // working directory. dotfiles-ai/build.mjs inherited process.cwd(), so
    // the same sources produced different bytes depending on where you stood
    // when you ran it — running the check from a subdirectory reported drift
    // that did not exist. Verified: rebuilding dotfiles-ai's committed
    // bundles from packages/build differed ONLY in those comments, and
    // became byte-identical once absWorkingDir was set.
    absWorkingDir: ctx.root,
    bundle: true,
    platform: "node",
    format: "esm",
    external: [...HOST_EXTERNAL, ...(spec.external ?? [])],
    outfile: at(ctx.root, spec.outfile),
    logLevel: ctx.logLevel ?? "info",
    ...(banner.length > 0 ? { banner: { js: banner } } : {}),
    ...spec.esbuild,
  };
  return options;
}

/**
 * Build one HOST half: platform node, format esm, `@deepseek-ai/*` and
 * `node:*` external. Everything else is bundled in, so the plugin file is
 * self-contained and the loader only has to resolve the dsh packages from the
 * host base at runtime.
 */
export async function buildHost(spec: HostBuild, ctx: HostBuildContext): Promise<BuildOutput> {
  const options = hostBuildOptions(spec, ctx);
  await build(options);
  const outfile = options.outfile as string;
  return {
    half: "host",
    name: ctx.name ?? spec.entry,
    entry: at(ctx.root, spec.entry),
    outfile,
    bytes: (await stat(outfile)).size,
  };
}
