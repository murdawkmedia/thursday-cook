import { buildClient } from "./client.js";
import { buildHost } from "./host.js";
import type { BuildOutput, BuildSpec } from "./spec.js";

/**
 * Build every half a spec declares, host halves first.
 *
 * Sequential on purpose: dotfiles-ai/build.mjs awaits each build in turn, and
 * esbuild's `logLevel: "info"` output is only readable if one build reports at
 * a time. The work is I/O-bound in esbuild's own worker pool anyway.
 */
export async function buildPackage(spec: BuildSpec): Promise<BuildOutput[]> {
  const outputs: BuildOutput[] = [];
  const ctx = { root: spec.root, name: spec.name, logLevel: spec.logLevel };
  for (const half of spec.host ?? []) {
    outputs.push(await buildHost(half, ctx));
  }
  for (const half of spec.client ?? []) {
    outputs.push(await buildClient(half, ctx));
  }
  return outputs;
}

/** Build several specs. This is the "build everything" entry point. */
export async function buildAll(specs: readonly BuildSpec[]): Promise<BuildOutput[]> {
  const outputs: BuildOutput[] = [];
  for (const spec of specs) {
    outputs.push(...(await buildPackage(spec)));
  }
  return outputs;
}
