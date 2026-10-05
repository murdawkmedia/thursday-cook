// Build declarations for the migrated host-plane plugin files.
//
// Migrated from dotfiles-ai/plugins/*.ts. Each file bundles to
// plugins/host/<name>.js — the flat directory the host-plane block's
// copy-tree installs and whose patch-row names (./plugins/<name>.js) the
// composition resolves. `discoverBuildSpecs` finds this file, so declaring
// the builds here is the whole registration.
//
// requireShim (the createRequire banner) goes on every half: several of
// these bundle dependencies that call require() with a bare specifier
// (yaml's `require("process")`, cross-spawn's `require("child_process")`),
// which the `node:*` external pattern does not match. Without it the whole
// plugin tree fails to load and dsh does not boot.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBuild } from "@trythursday/build";

const root = dirname(fileURLToPath(import.meta.url));
const host = (entry, outfile) => ({ entry, outfile, requireShim: true });

export default defineBuild({
  name: "@trythursday/host-plane",
  root,
  host: [
    host("src/see.ts", "dist/see.js"),
    host("src/profiles.ts", "dist/profiles.js"),
    host("src/grant.ts", "dist/grant.js"),
    host("src/resume.ts", "dist/resume.js"),
    host("src/ask-interrupt.ts", "dist/ask-interrupt.js"),
    host("src/log-exporter.ts", "dist/log-exporter.js"),
    host("src/bash-guard.ts", "dist/bash-guard.js"),
    host("src/manifest-guard.ts", "dist/manifest-guard.js"),
    host("src/package-tool.ts", "dist/package-tool.js"),
    host("src/tmp-dsh-shared.ts", "dist/tmp-dsh-shared.js"),
    host("src/approval-interrupt.ts", "dist/approval-interrupt.js"),
    host("src/subagent-steer.ts", "dist/subagent-steer.js"),
    host("src/context-guard.ts", "dist/skill-gate.js"),
  ],
});
