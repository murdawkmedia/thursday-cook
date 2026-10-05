// Build declaration for the migrated profiles-client plugin.
//
// Migrated from dotfiles-ai/plugins/profiles-client; `discoverBuildSpecs` finds this
// file, so declaring the build here is the whole registration.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "profiles-client",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/index.ts", outfile: "lib/index.js" }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "profiles-client" }],
});
