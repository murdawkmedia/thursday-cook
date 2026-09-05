// Bootstrap: transpile packages/build's own TypeScript to lib/.
//
// This script calls esbuild directly instead of using the module it is
// building, because the module cannot compile itself before it exists. It is
// intentionally the only place in the workspace that talks to esbuild without
// going through @trythursday/build.
//
// Transpile, not bundle: every internal import already carries a `.js`
// specifier, so a one-to-one src/*.ts -> lib/*.js emit keeps the ESM graph
// intact, keeps stack traces readable, and leaves esbuild itself as a plain
// runtime import resolved from the workspace root.
import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(here, "src");
const entryPoints = (await readdir(srcDir))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => join(srcDir, name));

await build({
  entryPoints,
  outdir: join(here, "lib"),
  platform: "node",
  format: "esm",
  target: "es2022",
  bundle: false,
  sourcemap: true,
  logLevel: "info",
});
