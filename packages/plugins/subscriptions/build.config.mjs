// Build declaration for the migrated subscriptions plugin.
//
// Migrated from dotfiles-ai/plugins/subscriptions; `discoverBuildSpecs` finds this
// file, so declaring the build here is the whole registration.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "subscriptions",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/index.ts", outfile: "lib/index.js", requireShim: true }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "subscriptions" }],
});
