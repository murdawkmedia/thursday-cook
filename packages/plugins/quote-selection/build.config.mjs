// Build declaration for the migrated quote-selection plugin.
//
// Migrated from dotfiles-ai/plugins/quote-selection; `discoverBuildSpecs` finds this
// file, so declaring the build here is the whole registration.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "quote-selection",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/index.ts", outfile: "lib/index.js" }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "quote-selection" }],
});
