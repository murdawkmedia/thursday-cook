/**
 * Regenerate `src/steps.generated.ts` from `data/steps.yaml`.
 *
 * The codegen entry is TypeScript (`scripts/gen-entry.ts`, typechecked with
 * the package), so this wrapper bundles it with the workspace esbuild into
 * a temp file and runs that on plain node. Run from anywhere: every path
 * derives from this file's location, and esbuild resolves from the
 * workspace root's node_modules (a root devDependency, already installed).
 *
 *   pnpm --filter @trythursday/thursday-tour run steps
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(here, "../../../..");
const esbuild = join(workspaceRoot, "node_modules", ".bin", "esbuild");

const scratch = mkdtempSync(join(tmpdir(), "thursday-tour-gen-"));
try {
  const bundle = join(scratch, "gen-entry.mjs");
  execFileSync(
    esbuild,
    [
      join(here, "gen-entry.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${bundle}`,
      "--log-level=error",
    ],
    {
      stdio: "inherit",
    },
  );
  // The bundle runs from the temp dir, so the package root travels as argv:
  // import.meta.url inside the bundle would name the temp file, not this package.
  execFileSync(process.execPath, [bundle, packageRoot], { stdio: "inherit" });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
