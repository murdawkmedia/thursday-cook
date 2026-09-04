import { checkDrift } from "./drift.js";
import { discoverBuildSpecs } from "./discover.js";
import { buildAll } from "./run.js";
import type { BuildOutput, BuildSpec } from "./spec.js";

export interface RunBuildOptions {
  /** Specs to build. Omit to discover them from the workspace. */
  specs?: readonly BuildSpec[];
  /** Workspace root used for discovery and as the git cwd for `--check`. */
  cwd?: string;
  /** Argument vector; defaults to `process.argv.slice(2)`. */
  argv?: readonly string[];
}

/**
 * The build entry point a package's `build` script calls, and the one the
 * workspace-wide build uses. Honours `--check`, which rebuilds and then asks
 * git whether the committed outputs drifted.
 */
export async function runBuild(options: RunBuildOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const cwd = options.cwd ?? process.cwd();
  const check = argv.includes("--check");

  const specs = options.specs ?? (await discoverBuildSpecs(cwd));
  if (specs.length === 0) {
    console.log("thursday-build: no build.config.mjs found; nothing to build");
  }
  const outputs: BuildOutput[] = await buildAll(specs);
  for (const out of outputs) {
    console.log(`  ${out.half.padEnd(6)} ${out.name}  ${out.outfile}  ${out.bytes} bytes`);
  }

  if (!check) return 0;
  const result = checkDrift(
    outputs.map((o) => o.outfile),
    cwd,
  );
  if (result.clean) {
    console.log(result.summary);
    return 0;
  }
  console.error(result.diff);
  console.error(result.summary);
  return 2;
}

/** `node lib/cli.js [--check]` from the workspace root. */
export async function main(): Promise<void> {
  process.exitCode = await runBuild();
}
