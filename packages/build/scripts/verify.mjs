// Acceptance harness: builds the fixtures through the public API and prints
// the evidence for each claim the module makes.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackage, checkDrift } from "../lib/index.js";
import spec from "../build.config.mjs";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(here, "../..");

const section = (title) => console.log(`\n=== ${title} ===`);

const outputs = await buildPackage(spec);
section("outputs");
for (const out of outputs) {
  console.log(`${out.half.padEnd(6)} ${out.outfile.slice(here.length + 1)}  ${out.bytes} bytes`);
}

const read = (rel) => readFile(resolve(here, rel), "utf8");

section("host half: imports that survived (externals)");
const host = await read("fixtures/dist/host.js");
console.log(
  host
    .split("\n")
    .filter((line) => /^(import|export) /.test(line))
    .join("\n"),
);
console.log("-- bundled local module present:", /hello \$\{who\}|hello /.test(host));

section("host half: createRequire banner + esbuild's __require shim");
const shim = await read("fixtures/dist/host-require-shim.js");
console.log(shim.split("\n").slice(0, 2).join("\n"));
console.log('-- bare require("child_process") in output:', /require\("child_process"\)/.test(shim));

section("client half: module-loader facade");
const client = await read("fixtures/dist/client.js");
const lines = client.split("\n");
console.log([...lines.slice(0, 6), "  ...", ...lines.slice(-4)].join("\n"));

section("client half: IIFE shape (no facade)");
const iife = await read("fixtures/dist/client-iife.js");
console.log(iife.trim());

section("drift check");
const drift = checkDrift(
  outputs.map((o) => o.outfile),
  workspaceRoot,
);
console.log(drift.summary);
console.log(
  "clean:",
  drift.clean,
  "| tracked:",
  drift.tracked.length,
  "| untracked:",
  drift.untracked.length,
);
