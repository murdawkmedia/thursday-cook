// How this plugin becomes a loadable dsh client bundle.
//
// `discoverBuildSpecs` walks `packages/plugins/*` looking for exactly this
// file, so declaring the build here is the whole registration -- there is no
// central array to add a row to, which is the point of the extraction that
// produced @trythursday/build.
//
// One client half and no host half: the fonts need a document and nothing
// else -- no files, no network, no Agent or Session access. The stylesheet is
// a string the plugin injects itself (there is no separate CSS file for the
// browser loader to resolve), and the three `.woff2` files it names live in
// the Thursday assets, not in this package, so there is nothing to bundle
// beside the client half.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "@trythursday/thursday-fonts",
  root: dirname(fileURLToPath(import.meta.url)),
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "thursday-fonts" }],
});
