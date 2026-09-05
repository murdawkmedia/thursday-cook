// The reference build declaration, and this module's own smoke test.
//
// This is the shape every other package copies: one file in the package
// directory, default-exporting defineBuild({...}). `discoverBuildSpecs` finds
// it without anything central being edited — which is the whole point of the
// extraction, since dotfiles-ai/build.mjs listed ~25 entry points in a single
// array in one file.
//
// The entries here are the fixtures under fixtures/, so `pnpm run build:all`
// from a clean tree exercises both bundling modes end to end.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineBuild } from "./lib/index.js";

export default defineBuild({
  name: "@trythursday/build fixtures",
  root: dirname(fileURLToPath(import.meta.url)),
  logLevel: "warning",
  host: [
    { entry: "fixtures/host/entry.ts", outfile: "fixtures/dist/host.js" },
    {
      entry: "fixtures/host/require-shim.ts",
      outfile: "fixtures/dist/host-require-shim.js",
      // The dependency calls require("child_process") by bare specifier.
      requireShim: true,
    },
  ],
  client: [
    { entry: "fixtures/client/entry.tsx", outfile: "fixtures/dist/client.js", id: "fixture" },
    {
      entry: "fixtures/client/iife.tsx",
      outfile: "fixtures/dist/client-iife.js",
      id: "fixture-iife",
      wrapper: "iife",
    },
  ],
});
