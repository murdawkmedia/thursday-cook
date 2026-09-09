// How this plugin becomes a loadable dsh client bundle.
//
// `discoverBuildSpecs` walks `packages/plugins/*` looking for exactly this
// file, so declaring the build here is the whole registration -- there is no
// central array to add a row to, which is the point of the extraction that
// produced @trythursday/build.
//
// One client half and no host half: the skin needs a document and nothing else
// -- no files, no network, no Agent or Session access. `@trythursday/tokens` is
// deliberately NOT external, so the generated token block is bundled into the
// client and the browser never has to resolve a workspace package.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "@trythursday/thursday-skin",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/index.ts", outfile: "lib/index.js" }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "thursday-skin" }],
});
