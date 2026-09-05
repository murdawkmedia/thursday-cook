#!/usr/bin/env node
/**
 * Build @trythursday/tokens.
 *
 * One source (src/tokens.ts) becomes three artifacts in dist/:
 *   index.js    -- the typed object and the CSS renderer, bundled by esbuild
 *   tokens.css  -- rendered by calling renderCss() from that very bundle
 *   tokens.json -- the same object for consumers with no JS runtime
 *   contrast-report.txt -- the measured contrast/luminance/hue figures
 * plus index.d.ts and friends, emitted by tsc.
 *
 * The CSS is produced by executing the built code rather than by a separate
 * generator, so the stylesheet and the object cannot disagree: if they did,
 * one of them would have to have come from somewhere else.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as esbuild from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const distDir = join(packageDir, "dist");

/** Find a workspace binary by walking up through node_modules/.bin. */
function findBin(name) {
  let dir = packageDir;
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return name; // fall back to PATH
    dir = parent;
  }
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// 1. Bundle the source of truth into runnable ESM.
await esbuild.build({
  entryPoints: [join(packageDir, "src", "index.ts")],
  outfile: join(distDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  logLevel: "warning",
});

// 2. Emit the two artifacts by running the bundle we just built.
const built = await import(pathToFileURL(join(distDir, "index.js")).href);
writeFileSync(join(distDir, "tokens.css"), built.renderCss(), "utf8");
writeFileSync(join(distDir, "tokens.json"), `${JSON.stringify(built.tokens, null, 2)}\n`, "utf8");
writeFileSync(join(distDir, "contrast-report.txt"), built.renderReport(), "utf8");

// 3. Types for the bundle.
execFileSync(findBin("tsc"), ["-p", join(packageDir, "tsconfig.build.json")], {
  stdio: "inherit",
  cwd: packageDir,
});

const count = Object.keys(built.tokens).length;
console.log(
  `@trythursday/tokens: ${count} tokens -> dist/index.js, dist/tokens.css, dist/tokens.json, dist/contrast-report.txt`,
);
