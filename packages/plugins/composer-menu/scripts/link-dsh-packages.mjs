/**
 * Link the dsh packages this plugin compiles against into its own
 * `node_modules`, so tests and typecheck resolve THE COPY THE HARNESS
 * ACTUALLY RUNS rather than a registry download.
 *
 * Copied from meridian-breaker's `scripts/link-dsh-packages.mjs`, which
 * documents the why in full: host halves bundle `@deepseek-ai/*` external
 * (packages/build's HOST_EXTERNAL), so the packages are never shipped and
 * never belong in the dependency closure -- but the `defineTool` value
 * import in `src/host.ts` still needs a resolution to typecheck and test
 * against. A registry pin would test against an API the runtime may not
 * have; the harness's own copy removes the question.
 *
 * Resolution order, same as the original: $THURSDAY_DSH_PACKAGE, then
 * `dsh` on PATH. Missing dsh fails loudly (no silent skip); see the
 * original file for the CI consequences.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Bare specifiers this package imports from the harness. */
const NEEDED = ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-ui-primitives"];

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDshPackage() {
  const tried = [];

  const override = process.env.THURSDAY_DSH_PACKAGE;
  if (override) {
    tried.push(`$THURSDAY_DSH_PACKAGE ${override}`);
    if (fs.existsSync(path.join(override, "package.json")))
      return { root: override, how: "$THURSDAY_DSH_PACKAGE" };
  }

  try {
    const which = execFileSync("sh", ["-c", "command -v dsh || true"], {
      encoding: "utf8",
    }).trim();
    if (which) {
      const real = fs.realpathSync(which);
      let dir = path.dirname(real);
      for (let i = 0; i < 5; i += 1) {
        const manifest = path.join(dir, "package.json");
        if (fs.existsSync(manifest)) {
          try {
            if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === "@deepseek-ai/dsh") {
              return { root: dir, how: `dsh on PATH (${which})` };
            }
          } catch {
            /* unreadable manifest: keep walking */
          }
        }
        dir = path.dirname(dir);
      }
      tried.push(`dsh on PATH -> ${real} (no @deepseek-ai/dsh package.json above it)`);
    } else {
      tried.push("dsh not on PATH");
    }
  } catch (error) {
    tried.push(`dsh on PATH lookup failed: ${error.message}`);
  }

  const detail = tried.map((t) => `  - ${t}`).join("\n");
  throw new Error(
    `composer-menu: cannot locate the @deepseek-ai/dsh installation.\n` +
      `Tried:\n${detail}\n\n` +
      `This package deliberately declares no registry copy of @deepseek-ai/*: it is an\n` +
      `esbuild external resolved from the host at runtime, so its tests must run against\n` +
      `the harness's own copy. Install dsh, or set THURSDAY_DSH_PACKAGE to the directory\n` +
      `containing the @deepseek-ai/dsh package.json.`,
  );
}

/** Replace whatever is at `linkPath` with a symlink to `target`. */
function relink(linkPath, target) {
  try {
    if (fs.realpathSync(linkPath) === fs.realpathSync(target)) return false;
  } catch {
    /* absent or dangling: fall through and (re)create */
  }
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(target, linkPath, "dir");
  return true;
}

const { root, how } = resolveDshPackage();
const scope = path.join(packageRoot, "node_modules", "@deepseek-ai");
fs.mkdirSync(scope, { recursive: true });

const report = [];
const missing = [];
for (const name of NEEDED) {
  // schemastery is unscoped and lives at the dsh install's top-level
  // node_modules; everything else is under @deepseek-ai scope.
  const target =
    name === "schemastery"
      ? path.join(root, "node_modules", name)
      : path.join(root, "node_modules", "@deepseek-ai", name);
  const linkPath = name === "schemastery"
    ? path.join(packageRoot, "node_modules", name)
    : path.join(scope, name);
  if (!fs.existsSync(target)) {
    missing.push(`${target} does not exist`);
    continue;
  }
  const changed = relink(linkPath, target);
  let version = "unknown";
  try {
    version = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8")).version;
  } catch {
    /* version is diagnostic only */
  }
  report.push(`  @deepseek-ai/${name}@${version}${changed ? " (linked)" : " (already current)"}`);
}

if (missing.length > 0) {
  throw new Error(
    `composer-menu: the dsh installation at ${root} is missing packages this plugin needs:\n` +
      missing.map((m) => `  - ${m}`).join("\n"),
  );
}

console.log(`composer-menu: resolved dsh via ${how}\n${report.join("\n")}`);
