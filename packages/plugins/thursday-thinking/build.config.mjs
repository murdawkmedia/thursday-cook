// How this plugin becomes a loadable dsh client bundle.
//
// `discoverBuildSpecs` walks `packages/plugins/*` looking for exactly this
// file, so declaring the build here is the whole registration -- there is no
// central array to add a row to, which is the point of the extraction that
// produced @trythursday/build.
//
// One client half and no host half: the indicator needs a document and nothing
// else -- no files, no network, no Agent or Session access.
//
// `@trythursday/tokens` is deliberately NOT external, so the two brand colours
// are resolved into the bundle at build time and the browser never has to
// resolve a workspace package. `data/phrases.json` is likewise bundled:
// esbuild has a native JSON loader, so the data file becomes a frozen object
// in the output and the plugin still ships as one file.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "@trythursday/thursday-thinking",
  root: dirname(fileURLToPath(import.meta.url)),
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "thursday-thinking" }],
});
