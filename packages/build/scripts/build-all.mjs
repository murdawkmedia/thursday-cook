// Build every package in the workspace that declares a build.config.mjs.
//
// This is the "build everything" replacement for the ~25-entry array in
// dotfiles-ai/build.mjs. Pass --check to rebuild and then verify that no
// committed bundle drifted from a fresh build.
//
// Run from anywhere: the workspace root is derived from this file's location.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild } from "../lib/cli.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.exitCode = await runBuild({ cwd: workspaceRoot, argv: process.argv.slice(2) });
