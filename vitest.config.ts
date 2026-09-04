import { defineConfig } from "vitest/config";

// The build step drops compiled .js files next to their .ts sources
// (plugins/bash-guard.js beside plugins/bash-guard.ts). Vite's default
// extension order resolves .js first, so tests silently imported the stale
// build. Sources win here; .js stays in the list for plain-JS helpers.
//
// Package test configs extend this file. The root config runs no tests of its
// own -- `pnpm test` recurses into the workspace -- so it passes with no test
// files, which is the state the workspace starts in.
export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
