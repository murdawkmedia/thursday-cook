#!/usr/bin/env node
/**
 * Build the static site.
 *
 * WHY THIS AND NOT A FRAMEWORK. The site is two pages of static HTML with one
 * small enhancement script. Astro, Next or Eleventy would each add a build
 * runtime, a template dialect and a dependency tree to produce files this
 * script produces in about eighty lines using the esbuild and TypeScript that
 * the workspace root already installs for every package. It also matches the
 * house pattern exactly: `packages/tokens` builds itself the same way, with
 * `node scripts/build.mjs` driving esbuild and tsc. Total new dependencies for
 * this package: zero, plus the workspace token package it consumes.
 *
 * Three steps, in order:
 *   1. bundle the TypeScript generator to build/generate.mjs and run it;
 *   2. bundle src/styles/site.css, which pulls @thursday/tokens/tokens.css in
 *      through esbuild's package resolution, to dist/assets/site.css;
 *   3. bundle src/client/enhance.ts to dist/assets/enhance.js;
 *   4. run the emitted HTML through the workspace's own prettier, which tidies
 *      the template-literal indentation and, because prettier parses before it
 *      prints, fails the build on markup that does not parse.
 *
 * The assets are emitted unminified on purpose: the whole payload is a few
 * kilobytes, and a design-system stylesheet whose comments state which token
 * goes where is worth more to the next person than the bytes minifying saves.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as esbuild from "esbuild";
import * as prettier from "prettier";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const distDir = join(packageDir, "dist");
const workDir = join(packageDir, "build");
const generatorFile = join(workDir, "generate.mjs");
const logoSource = join(repoRoot, "assets", "thursday-logo.svg");

if (!existsSync(logoSource)) {
  throw new Error(`missing brand asset: ${relative(repoRoot, logoSource)}`);
}

// 1. Bundle the generator, then use it to clear and fill dist/.
await esbuild.build({
  entryPoints: [join(packageDir, "src", "site", "build.ts")],
  outfile: generatorFile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "bundle",
  external: ["node:*"],
  logLevel: "warning",
});

const generator = await import(`${pathToFileURL(generatorFile).href}?v=${Date.now()}`);
generator.cleanDir(distDir);
generator.buildSite({ outDir: distDir, logoSource });

// 2. One stylesheet, with the token package's own :root block inlined.
await esbuild.build({
  entryPoints: [join(packageDir, "src", "styles", "site.css")],
  outfile: join(distDir, "assets", "site.css"),
  bundle: true,
  loader: { ".css": "css" },
  logLevel: "warning",
});

// 3. The single enhancement script.
await esbuild.build({
  entryPoints: [join(packageDir, "src", "client", "enhance.ts")],
  outfile: join(distDir, "assets", "enhance.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
});

// 4. Format the emitted HTML. Doubles as a parse check on every page.
const prettierConfig = await prettier.resolveConfig(join(packageDir, "package.json"));
for (const page of generator.PAGES) {
  const file = join(distDir, page.file);
  const source = readFileSync(file, "utf8");
  writeFileSync(file, await prettier.format(source, { ...prettierConfig, parser: "html" }), "utf8");
}

/** Every emitted file, with its size, for the build summary. */
function listFiles(dir, base = dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory()
        ? listFiles(full, base)
        : [[relative(base, full), statSync(full).size]];
    });
}

const emitted = listFiles(distDir);
const total = emitted.reduce((sum, [, size]) => sum + size, 0);
const urls = generator.PAGES.map((page) => page.url).join(", ");
console.log(`@thursday/website: ${generator.PAGES.length} pages (${urls}) -> dist/`);
for (const [file, size] of emitted) {
  console.log(`  ${String(size).padStart(6)}  ${file}`);
}
console.log(`  ${String(total).padStart(6)}  total (${emitted.length} files)`);
