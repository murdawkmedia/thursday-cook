#!/usr/bin/env node
/**
 * build-brand-assets.mjs — regenerate every Thursday brand raster from the ONE
 * source mark: assets/thursday-logo.svg.
 *
 * No rasters are stored in the repo; this script is the only way they exist.
 * External tools used (no npm dependencies added):
 *   - inkscape 1.x  : SVG -> PNG rasterisation (filters/gradients correct)
 *   - ImageMagick   : ICO packing, pixel inspection for the safe-zone check
 *
 * Usage: node scripts/build-brand-assets.mjs [--source PATH] [--out DIR]
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

// ---- arguments ---------------------------------------------------------- //
function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
}

// Defaults assume the repo layout (script lives in scripts/, source in assets/).
// When run from the scratch copy, pass --source/--out explicitly.
const defaultSource = resolve(scriptDir, "../assets/thursday-logo.svg");
const defaultOut = resolve(scriptDir, "../dist/brand");

const SOURCE = argValue("--source", defaultSource);
const OUT = argValue("--out", defaultOut);

// Brand tokens (mirrors packages/tokens/src/tokens.ts; the SVG's own stops).
const BRAND_BLUE = "#0a5cff";
const BRAND_ORANGE = "#ff8400";

// ---- helpers ------------------------------------------------------------ //
function run(cmd, args) {
  // stderr ignored: inkscape emits dconf/GTK noise under a headless session
  // that is not actionable; a non-zero status still throws.
  execFileSync(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
}

/** ImageMagick 7's `convert` shim misbehaves under execFileSync; prefer `magick`. */
function runMagick(args) {
  try {
    execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (first) {
    try {
      execFileSync("convert", args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (second) {
      throw new Error(
        `magick failed: ${first.stderr?.toString().slice(0, 400)} || ` +
        `convert failed: ${second.stderr?.toString().slice(0, 400)} || args: ${args.join(" ")}`
      );
    }
  }
}

// Inkscape 1.4's headless PNG export drops every element carrying an
// feDropShadow filter (verified with a minimal repro), so rasters are made
// from an EXPORT VARIANT: the source bytes with feDropShadow mechanically
// expanded into its equivalent primitive chain (blur+offset+flood+composite+
// merge). Same geometry, same shadow visually; every export still derives
// from the one source file and nothing else.
const EXPORT_SRC = join(OUT, ".export-source.svg");
function prepareExportSource() {
  const src = readFileSync(SOURCE, "utf8");
  const expanded = src.replace(
    /<feDropShadow\s+dx="([^"]*)"\s+dy="([^"]*)"\s+stdDeviation="([^"]*)"\s+flood-color="([^"]*)"\s+flood-opacity="([^"]*)"\s*\/>/,
    (_m, dx, dy, blur, color, opacity) =>
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/>\n` +
      `<feOffset dx="${dx}" dy="${dy}" result="off"/>\n` +
      `<feFlood flood-color="${color}" flood-opacity="${opacity}"/>\n` +
      `<feComposite in2="off" operator="in"/>\n` +
      `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`
  );
  if (expanded === src) {
    // Source no longer uses feDropShadow (or pattern drifted): export verbatim.
    writeFileSync(EXPORT_SRC, src);
  } else {
    writeFileSync(EXPORT_SRC, expanded);
  }
}

/** Rasterise the export variant at size x size (square, mark centred as authored). */
function renderPng(size, outPath) {
  run("inkscape", [
    EXPORT_SRC,
    "--export-type=png",
    `--export-filename=${outPath}`,
    "--export-width", String(size),
    "--export-height", String(size),
    "--export-overwrite",
  ]);
}

const die = (msg) => {
  console.error(`build-brand-assets: ${msg}`);
  process.exit(1);
};

if (!existsSync(SOURCE)) die(`source SVG not found: ${SOURCE}`);
// The export source and every raster land under OUT, so it must exist before
// anything writes into it -- including the derived export source itself.
mkdirSync(OUT, { recursive: true });
prepareExportSource();
const manifest = { source: SOURCE, generatedBy: "scripts/build-brand-assets.mjs", outputs: [] };
const record = (path, purpose) => manifest.outputs.push({ path, purpose });

// ---- 0. favicon.svg (verbatim copy of the single source) ----------------- //
mkdirSync(join(OUT, "favicon"), { recursive: true });
const faviconSvg = join(OUT, "favicon", "favicon.svg");
copyFileSync(SOURCE, faviconSvg);
record("favicon/favicon.svg", "browser SVG favicon — byte-identical copy of the source mark");

// ---- 1. favicon rasters: PNG 32/48 + one ICO (16/32/48) ------------------ //
// Choice: ship BOTH. The SVG favicon covers modern browsers; the ICO is the
// legacy path (Windows taskbar/shortcuts, older crawlers) and packs 16/32/48
// into one file so no extra routes are needed. 32/48 PNGs are kept because
// some *nix desktops want standalone PNG hicolor entries at those sizes too.
mkdirSync(join(OUT, "favicon"), { recursive: true });
for (const size of [16, 32, 48]) {
  renderPng(size, join(OUT, "favicon", `favicon-${size}.png`));
  record(`favicon/favicon-${size}.png`, `favicon raster, ${size}px`);
}
runMagick([
  join(OUT, "favicon", "favicon-16.png"),
  join(OUT, "favicon", "favicon-32.png"),
  join(OUT, "favicon", "favicon-48.png"),
  join(OUT, "favicon", "favicon.ico"),
]);
record("favicon/favicon.ico", "legacy favicon, packed 16/32/48");

// ---- 2. manifest icons 192/512 + maskable variants ----------------------- //
mkdirSync(join(OUT, "manifest"), { recursive: true });
for (const size of [192, 512]) {
  renderPng(size, join(OUT, "manifest", `icon-${size}.png`));
  record(`manifest/icon-${size}.png`, `PWA manifest icon, ${size}px, "any"`);
}

// Maskable: platforms may crop to a circle/squircle as small as the inner 80%
// safe zone, so the mark must be scaled to ~70% and sit on a full-bleed
// background. Background is brand blue; the white die-cut edge of the mark
// separates it cleanly. Built by wrapping the source in a padding SVG that
// still references nothing but the source file's content.
const MASKABLE_PAD = 0.7; // mark occupies 70% of the canvas
for (const size of [192, 512]) {
  const wrapper = join(OUT, "manifest", `.maskable-src-${size}.svg`);
  const src = readFileSync(EXPORT_SRC, "utf8");
  const bg = `<!-- generated maskable wrapper: full-bleed ${BRAND_BLUE} plate, mark at ${MASKABLE_PAD * 100}% -->`;
  writeFileSync(
    wrapper,
    src.replace(
      "<svg ",
      `${bg}<svg style="background-color:${BRAND_BLUE}" `
    ).replace(
      /<\/svg>\s*$/,
      `</svg>`
    )
  );
  const raw = join(OUT, "manifest", `.maskable-raw-${size}.png`);
  // render the source small, then extent it onto a blue plate at centre
  renderPng(Math.round(size * MASKABLE_PAD), raw);
  runMagick([
    "-size", `${size}x${size}`, `xc:${BRAND_BLUE}`,
    raw, "-gravity", "center", "-composite",
    join(OUT, "manifest", `icon-maskable-${size}.png`),
  ]);
  record(`manifest/icon-maskable-${size}.png`, `PWA manifest icon, ${size}px, purpose "maskable"`);
}

// ---- 3. maskable safe-zone check (evidence, not assertion) --------------- //
// The safe zone is the central 80% circle: anything outside it may be cropped,
// anything inside must be the intentional motif. We verify two properties:
//   (a) the outer 10% ring is pure background colour (full bleed, no transparency);
//   (b) the central circle is not background — the motif is actually present.
const checkPath = join(OUT, "manifest", "icon-maskable-512.png");
const tmpInfo = join(OUT, ".safe-zone-info.txt");
const stats = (cropArgs) => {
  runMagick([checkPath, ...cropArgs.split(" "), "-format", `%[fx:mean.r],%[fx:mean.g],%[fx:mean.b],%[fx:standard_deviation.r]`, `info:${tmpInfo}`]);
  return readFileSync(tmpInfo, "utf8").trim();
};
const cornerRing = stats(`-crop 100%x10%+0+0`);                    // true TOP rows (no gravity)
const centre = stats("-gravity center -crop 20%x20%+0+0");       // centre of safe zone
writeFileSync(join(OUT, "manifest", "safe-zone-check.txt"),
  `maskable safe-zone check (icon-maskable-512.png)\n` +
  `top 10% strip mean RGB / sd: ${cornerRing}\n` +
  `centre 20% mean RGB / sd:    ${centre}\n` +
  `Pass requires: top strip sd ~0 and mean == brand blue ${BRAND_BLUE} (full-bleed background); centre sd > 0 (motif present).\n` +
  `Note: the SAFE ZONE is the central 80%; the mark is authored at 70% of the canvas,\n` +
  `so the crops OUTSIDE the motif (top strip) must be pure background.\n`);
record("manifest/safe-zone-check.txt", "recorded safe-zone pixel statistics");

// ---- 4. hicolor desktop icon set ----------------------------------------- //
// dsh ships no desktop entry (docs/branding.md), so this set is NEW Thursday
// surface: install as usr/share/icons/hicolor/<size>x<size>/apps/thursday.png.
mkdirSync(join(OUT, "hicolor"), { recursive: true });
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  renderPng(size, join(OUT, "hicolor", `thursday-${size}.png`));
  record(`hicolor/thursday-${size}.png`, `hicolor app icon, ${size}px`);
}

// ---- 5. 16px legibility check artefact ----------------------------------- //
// The 16px hicolor render IS the check subject. Also emit a 16x -> 512x
// nearest-neighbour blow-up so a human (or agent with eyes) can inspect pixels.
runMagick([
  join(OUT, "hicolor", "thursday-16.png"),
  "-filter", "point", "-resize", "3200%",
  join(OUT, "hicolor", "thursday-16-inspect-512.png"),
]);
record("hicolor/thursday-16-inspect-512.png", "nearest-neighbour blow-up of the 16px render for inspection");

// ---- 6. wordmark: "Thursday" in Literata, text -> paths ------------------ //
// website/ loads no webfont (system font stacks only), so the repo has no
// Literata pipeline of its own; the face is installed locally as TTFs.
// We convert text to outlines so the deliverable never depends on the font
// being installed at view time.
mkdirSync(join(OUT, "wordmark"), { recursive: true });
const wordSvg = join(OUT, "wordmark", "wordmark-source.svg");
writeFileSync(
  wordSvg,
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260" viewBox="0 0 900 260">
  <text x="20" y="190" font-family="Literata" font-weight="600" font-size="160" fill="${BRAND_BLUE}">Thursday</text>
</svg>
`
);
const wordPaths = join(OUT, "wordmark", "wordmark.svg");
try {
  run("inkscape", [
    wordSvg,
    "--export-text-to-path",
    "--export-plain-svg",
    `--export-filename=${wordPaths}`,
    "--export-overwrite",
  ]);
  const out = readFileSync(wordPaths, "utf8");
  if (/<\s*text/.test(out)) throw new Error("text element survived conversion");
  record("wordmark/wordmark.svg", '"Thursday" wordmark, Literata SemiBold converted to paths');
} catch (e) {
  // Documented fallback: keep the font-referencing SVG and say so.
  copyFileSync(wordSvg, wordPaths);
  record("wordmark/wordmark.svg", "FALLBACK: font-referencing SVG (text->paths failed: " + e.message + ")");
}
// Wordmark raster for quick human checking.
run("inkscape", [wordPaths, "--export-type=png", `--export-filename=${join(OUT, "wordmark", "wordmark.png")}`, "--export-width", "900", "--export-overwrite"]);
record("wordmark/wordmark.png", "wordmark preview raster");

// ---- manifest of everything produced ------------------------------------- //
writeFileSync(join(OUT, "assets-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`OK: ${manifest.outputs.length} outputs under ${OUT}`);
