// How this plugin becomes loadable dsh bundles.
//
// `discoverBuildSpecs` walks `packages/plugins/*` looking for exactly this
// file, so declaring the build here is the whole registration -- there is no
// central array to add a row to.
//
// Two halves, like thursday-mark (copied from it, not from the client-only
// skin and indicator):
//
//   - host: owns the step list, derived completion, durable progress and the
//     agent lookup tool. Needs files and process state, so it cannot live in
//     the browser.
//   - client: renders the tour panel into dsh's shell.overlay seat and
//     spotlights each step's target. Needs a document and nothing else.
//
// `@trythursday/tokens` is deliberately NOT external on either half, so the
// card colours resolve into the bundles at build time and neither the
// browser nor the host route ever resolves a workspace package.
// `@deepseek-ai/*` stays external on the host half (packages/build's
// HOST_EXTERNAL): the loader resolves it from the host base at runtime.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "@trythursday/thursday-tour",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [{ entry: "src/host.ts", outfile: "lib/host.js" }],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "thursday-tour" }],
});
