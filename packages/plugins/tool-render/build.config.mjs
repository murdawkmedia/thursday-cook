// Build declaration for the migrated tool-render plugin.
//
// Migrated from dotfiles-ai/plugins/tool-render; `discoverBuildSpecs` finds
// this file, so declaring the build here is the whole registration. The
// dist/ output paths match the package.json main/exports (unlike the lib/
// convention of the other migrated plugins) because the block links this
// exact directory and the loader reads main.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "tool-render",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/index.ts", outfile: "dist/index.js", requireShim: true }],
  client: [{ entry: "src/client.tsx", outfile: "dist/client.js", id: "tool-render" }],
});
