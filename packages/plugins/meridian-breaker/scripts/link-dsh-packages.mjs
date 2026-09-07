/**
 * Link the dsh packages this plugin compiles against into its own
 * `node_modules`, so tests and typecheck resolve THE COPY THE HARNESS ACTUALLY
 * RUNS rather than a registry download.
 *
 * ── Why this is not a normal dependency ─────────────────────────────────
 *
 * `packages/build/src/spec.ts:19` declares `HOST_EXTERNAL = ["@deepseek-ai/*",
 * "node:*"]`. A host plugin is bundled with every `@deepseek-ai/*` specifier
 * left EXTERNAL, and the dsh loader resolves it from the host at run time. So
 * schemastery is never shipped inside this plugin and never belongs in its
 * dependency closure.
 *
 * It is still needed to run the tests and to typecheck. Declaring a registry
 * version would satisfy the resolver while introducing the one failure this
 * repository has already paid for once: testing against an API the runtime
 * does not have. A pinned `3.18.1` is right only for as long as the installed
 * dsh also carries 3.18.1, and nothing would tell us when that stopped being
 * true — the suite would go green against the wrong oracle.
 *
 * Resolving the running harness's own copy removes the question. There is no
 * version to keep in step, because there is only one copy.
 *
 * ── How the dsh installation is found ───────────────────────────────────
 *
 * The same order `packages/session/src/runtime.mjs:75` uses, for the same
 * reason: the `dsh` on PATH is the one that actually runs, so it is the
 * authoritative answer rather than a guess at a global directory.
 *
 *   1. $THURSDAY_DSH_PACKAGE, when set (explicit override, CI and tests)
 *   2. `command -v dsh` -> realpath -> walk up to the @deepseek-ai/dsh package
 *
 * ── When dsh is not installed ───────────────────────────────────────────
 *
 * This script exits NON-ZERO with the list of what it tried, and `pnpm test`
 * and `pnpm typecheck` for this package fail. That is deliberate. The
 * alternative — falling back to a registry copy — is exactly the silent wrong
 * oracle described above, and a skipped suite that reports success is worse
 * than a failure that names its cause.
 *
 * ── What this means for CI, stated so it is a decision and not a surprise ──
 *
 * A machine with no dsh installation CANNOT run this package's tests or
 * typecheck. They fail here, loudly, rather than skipping. Whoever configures
 * CI has to pick one of:
 *
 *   1. install dsh in the job — recommended, because it is the thing this
 *      plugin actually runs inside;
 *   2. set $THURSDAY_DSH_PACKAGE to an unpacked @deepseek-ai/dsh; or
 *   3. exclude this package from that job — which is allowed, but must be
 *      written down, because a green run that quietly skipped this suite is
 *      the exact failure this file exists to prevent.
 *
 * There is deliberately no "skip when missing" mode. A suite that silently
 * does not run is indistinguishable from a suite that passed.
 *
 * ── Why this duplicates the session package's resolver ──────────────────
 *
 * `packages/session/src/runtime.mjs:75` already exports `resolveDshPackage`,
 * and this is the same algorithm rather than a second design. It is COPIED,
 * not imported, on purpose: importing it would make a host plugin devDepend on
 * the session CLI package — and add a workspace dependency and lockfile entry
 * to a package whose entire point is to have neither — for about thirty lines.
 *
 * That trade is worth revisiting. If a third caller ever needs this, extract it
 * into a small shared package instead of copying it a third time.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Bare specifiers this package imports from the harness. */
const NEEDED = ["schemastery", "cordis", "dsh-agent"];

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
    `meridian-breaker: cannot locate the @deepseek-ai/dsh installation.\n` +
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
  const target = path.join(root, "node_modules", "@deepseek-ai", name);
  if (!fs.existsSync(target)) {
    missing.push(`${target} does not exist`);
    continue;
  }
  const changed = relink(path.join(scope, name), target);
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
    `meridian-breaker: the dsh installation at ${root} is missing packages this plugin needs:\n` +
      missing.map((m) => `  - ${m}`).join("\n"),
  );
}

console.log(`meridian-breaker: resolved dsh via ${how}\n${report.join("\n")}`);
