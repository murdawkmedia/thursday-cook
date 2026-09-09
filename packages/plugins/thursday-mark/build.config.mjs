// How this plugin becomes loadable dsh bundles.
//
// `discoverBuildSpecs` walks `packages/plugins/*` looking for exactly this
// file, so declaring the build here is the whole registration -- there is no
// central array to add a row to.
//
// Two halves, unlike the skin and the indicator, which are client-only:
//
//   - host: serves the favicon and the web app manifest from B2's export set
//     (`dist/brand`, cut by scripts/build-brand-assets.mjs from the one
//     source) through the webServer service's exact routes. Needs files and a
//     listening server, so it cannot live in the browser.
//   - client: takes over dsh's brand-mark slots with the animated Thursday
//     mark. Needs a document and nothing else.
//
// `@trythursday/tokens` is deliberately NOT external on either half, so the
// two brand colours resolve into the bundles at build time and neither the
// browser nor the manifest route ever resolves a workspace package.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "@trythursday/thursday-mark",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/host.ts", outfile: "lib/host.js" }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "thursday-mark" }],
});
