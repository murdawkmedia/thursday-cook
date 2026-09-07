/**
 * Locate the real dsh installation and the pinned `dsh-compaction-instant`
 * fork on this machine, and import THEIR ACTUAL EXPORTED FUNCTIONS.
 *
 * This module is the whole reason `thursday session` is not a reimplementation.
 * Nothing here parses a session log, folds a surface, projects a message,
 * counts a token or computes a repair: it only finds the packages that already
 * do, and hands their exports to the rest of the tool.
 *
 * Three substrate layers, all resolved here:
 *
 *   A. `@deepseek-ai/dsh-session` — the event/surface model.
 *      `foldSurface`, `deriveEventMessage`, `interruptedTurnClosers`,
 *      `decodeStorageRecord`. Shipped as real `.js` under `lib/types/`, so
 *      they import directly.
 *
 *   B. `@deepseek-ai/dsh-compaction-basic` — the pinned fork of
 *      `dsh-compaction-instant` (installed under the aliased name; see
 *      packages/blocks/compaction-instant.md). `recallSession`,
 *      `searchSession`, `projectMessageText`, `findCheckpointSeqs`,
 *      `truncateTokens`, `estimateEntryTokens`, `inspectCompactionEntryState`.
 *
 *   C. `@trythursday/install` — DETECT_ACTIONS and the block loader, for the
 *      doctor's drift report. Bundled on demand (see `loadInstallEngine`)
 *      because its sources use extensionless relative imports that Node's ESM
 *      resolver rejects.
 *
 * DELIBERATE NON-REUSE, stated honestly: `@deepseek-ai/dsh-session-persistence-jsonl`
 * defines `scanLog`, `parseHeaderMeta` and the zstd frame helpers inside its
 * `lib/index.js` bundle, but its only export statement is
 * `export { JsonlCompressionSchema, JsonlSessionPersistence, ... }`. Those
 * parsing functions are UNREACHABLE without constructing the cordis plugin and
 * a whole Context. `read.mjs` therefore re-derives only the container walk
 * (concatenated zstd frames -> JSONL lines) from Node builtins, and delegates
 * every line's MEANING to layer A's `decodeStorageRecord`. See REPORT.md.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";

/** Where a resolved substrate module came from, for `thursday session doctor`. */
export class ResolutionError extends Error {
  constructor(what, tried) {
    super(
      `cannot locate ${what}. Tried:\n` + tried.map((t) => `  - ${t}`).join("\n"),
    );
    this.what = what;
    this.tried = tried;
  }
}

function firstExistingDir(candidates) {
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {
      /* not there */
    }
  }
  return undefined;
}

/**
 * Resolve the root of the installed `@deepseek-ai/dsh` package.
 *
 * Order: explicit override, then the `dsh` binary on PATH resolved through its
 * symlink (the authoritative answer — it is the dsh that actually runs), then
 * the conventional global locations.
 *
 * @param {{dshPackageRoot?: string}} [opts]
 * @returns {{root: string, how: string}}
 */
export function resolveDshPackage(opts = {}) {
  const tried = [];
  if (opts.dshPackageRoot) {
    tried.push(`--dsh-package ${opts.dshPackageRoot}`);
    if (fs.existsSync(path.join(opts.dshPackageRoot, "package.json"))) {
      return { root: opts.dshPackageRoot, how: "explicit --dsh-package" };
    }
  }
  if (process.env.THURSDAY_DSH_PACKAGE) {
    const p = process.env.THURSDAY_DSH_PACKAGE;
    tried.push(`$THURSDAY_DSH_PACKAGE ${p}`);
    if (fs.existsSync(path.join(p, "package.json"))) {
      return { root: p, how: "$THURSDAY_DSH_PACKAGE" };
    }
  }

  // The dsh on PATH is the one that actually writes the logs we read.
  try {
    const which = execFileSync("sh", ["-c", "command -v dsh"], {
      encoding: "utf8",
    }).trim();
    if (which) {
      const real = fs.realpathSync(which); // .../@deepseek-ai/dsh/lib/bin.js
      // walk up to the directory containing package.json
      let dir = path.dirname(real);
      for (let i = 0; i < 5; i += 1) {
        if (fs.existsSync(path.join(dir, "package.json"))) {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(dir, "package.json"), "utf8"),
          );
          if (pkg.name === "@deepseek-ai/dsh") {
            return { root: dir, how: `dsh on PATH (${which})` };
          }
        }
        dir = path.dirname(dir);
      }
      tried.push(`dsh on PATH -> ${real} (no @deepseek-ai/dsh package.json above it)`);
    } else {
      tried.push("dsh not on PATH");
    }
  } catch (e) {
    tried.push(`dsh on PATH lookup failed: ${e.message}`);
  }

  throw new ResolutionError("the @deepseek-ai/dsh package", tried);
}

/**
 * Import layer A: the session event/surface model from the installed dsh.
 *
 * Every function here is dsh's own. `surface.js` and `repair.js` and
 * `chunk-rows.js` are real files inside the published `files` list, so they
 * import without any bundling step.
 *
 * @param {{dshPackageRoot?: string}} [opts]
 */
export async function loadSessionModel(opts = {}) {
  const { root, how } = resolveDshPackage(opts);
  const base = path.join(root, "node_modules/@deepseek-ai/dsh-session/lib/types");
  const need = ["surface.js", "repair.js", "chunk-rows.js"];
  const missing = need.filter((f) => !fs.existsSync(path.join(base, f)));
  if (missing.length > 0) {
    throw new ResolutionError(
      "@deepseek-ai/dsh-session internals",
      [`${base} is missing: ${missing.join(", ")}`],
    );
  }
  const surface = await import(path.join(base, "surface.js"));
  const repair = await import(path.join(base, "repair.js"));
  const chunkRows = await import(path.join(base, "chunk-rows.js"));

  let version = "unknown";
  try {
    version = JSON.parse(
      fs.readFileSync(
        path.join(root, "node_modules/@deepseek-ai/dsh-session/package.json"),
        "utf8",
      ),
    ).version;
  } catch {
    /* leave unknown */
  }

  return {
    origin: { package: "@deepseek-ai/dsh-session", version, base, how },
    /** THE canonical surface fold. Throws on a structurally invalid surface. */
    foldSurface: surface.foldSurface,
    /** THE per-node projection rule; the callback the fork's duck type wants. */
    deriveEventMessage: surface.deriveEventMessage,
    isSurfaceEvent: surface.isSurfaceEvent,
    isAppendSurfaceEvent: surface.isAppendSurfaceEvent,
    isReplacementSurfaceEvent: surface.isReplacementSurfaceEvent,
    isSurfaceEligibleType: surface.isSurfaceEligibleType,
    /** THE repair rule: deterministic closers for an open tail turn. */
    interruptedTurnClosers: repair.interruptedTurnClosers,
    TOOL_NOT_STARTED: repair.TOOL_NOT_STARTED,
    TOOL_OUTCOME_UNKNOWN: repair.TOOL_OUTCOME_UNKNOWN,
    /** Expands packed `*-chunks` storage rows back to the exact events. */
    decodeStorageRecord: chunkRows.decodeStorageRecord,
    packChunkRuns: chunkRows.packChunkRuns,
  };
}

/**
 * Locate the installed pinned fork. It is installed UNDER THE ALIAS
 * `@deepseek-ai/dsh-compaction-basic` (packages/blocks/compaction-instant.md
 * `as:`), so we look for the alias and then confirm from its own package.json
 * that it really is the fork (`name: dsh-compaction-instant`) rather than the
 * builtin basic engine it shadows.
 *
 * @param {{compactionRoot?: string, dshHome?: string, profile?: string}} [opts]
 */
export function resolveCompactionFork(opts = {}) {
  const tried = [];
  const profile = opts.profile ?? "web";
  const candidates = [];
  if (opts.compactionRoot) candidates.push(opts.compactionRoot);
  if (process.env.THURSDAY_COMPACTION_PACKAGE)
    candidates.push(process.env.THURSDAY_COMPACTION_PACKAGE);
  const homes = [];
  if (opts.dshHome) homes.push(opts.dshHome);
  if (process.env.THURSDAY_HOME) homes.push(path.join(process.env.THURSDAY_HOME, "dsh"));
  homes.push(path.join(homedir(), ".thursday", "dsh"));
  if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME);
  homes.push(path.join(homedir(), ".dsh"));
  for (const h of homes) {
    candidates.push(
      path.join(h, "profiles", profile, "node_modules/@deepseek-ai/dsh-compaction-basic"),
    );
  }

  for (const c of candidates) {
    tried.push(c);
    const pj = path.join(c, "package.json");
    if (!fs.existsSync(pj)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
    } catch (e) {
      tried[tried.length - 1] += ` (unreadable package.json: ${e.message})`;
      continue;
    }
    // The alias may hold either the fork or the genuine builtin basic engine.
    // Only the fork carries the recall/search/region surface we need.
    const isFork = pkg.name === "dsh-compaction-instant";
    const hasSrc = fs.existsSync(path.join(c, "src/recall.js"));
    if (!isFork || !hasSrc) {
      tried[tried.length - 1] +=
        ` (present but is "${pkg.name}"@${pkg.version}${hasSrc ? "" : ", no src/recall.js"} — not the fork)`;
      continue;
    }
    return { root: c, name: pkg.name, version: pkg.version, installedAs: "@deepseek-ai/dsh-compaction-basic" };
  }
  throw new ResolutionError(
    "the pinned dsh-compaction-instant fork (installed as @deepseek-ai/dsh-compaction-basic)",
    tried,
  );
}

/**
 * Import layer B: the fork's log-walking, projection and bounding functions.
 *
 * These are the functions this ticket exists to reuse. Note what they are and
 * are not: they read a SESSION-SHAPED VALUE (`{ events, deriveEventMessage? }`,
 * see the fork's types/recall.d.ts:45-48), never a file. `read.mjs` builds that
 * value; these functions walk it.
 *
 * @param {Parameters<typeof resolveCompactionFork>[0]} [opts]
 */
export async function loadCompactionFork(opts = {}) {
  const found = resolveCompactionFork(opts);
  const recall = await import(path.join(found.root, "src/recall.js"));
  const search = await import(path.join(found.root, "src/search.js"));
  const compiler = await import(path.join(found.root, "src/compiler.js"));
  const region = await import(path.join(found.root, "src/region.js"));
  return {
    origin: found,
    // --- walking / resolving pointers into the durable log
    recallSession: recall.recallSession,
    parseSeqSpec: recall.parseSeqSpec,
    expandSelections: recall.expandSelections,
    resolveRecallReference: recall.resolveRecallReference,
    findCheckpointSeqs: recall.findCheckpointSeqs,
    projectMessageText: recall.projectMessageText,
    DEFAULT_MAX_RECALL_TOKENS: recall.DEFAULT_MAX_RECALL_TOKENS,
    MAX_RECALL_SPAN: recall.MAX_RECALL_SPAN,
    // --- bounded search
    searchSession: search.searchSession,
    compileSearchPattern: search.compileSearchPattern,
    DEFAULT_MAX_SEARCH_HITS: search.DEFAULT_MAX_SEARCH_HITS,
    MAX_LINES_PER_HIT: search.MAX_LINES_PER_HIT,
    // --- the bound enforcer and its token model
    truncateTokens: compiler.truncateTokens,
    estimateEntryTokens: compiler.estimateEntryTokens,
    countTokens: compiler.countTokens,
    sanitize: compiler.sanitize,
    projectToolResultText: compiler.projectToolResultText,
    excerptToolResult: compiler.excerptToolResult,
    // --- checkpoint framing: "what did this projection fold to, and why"
    isCheckpointSource: compiler.isCheckpointSource,
    unframeCheckpointText: compiler.unframeCheckpointText,
    CHECKPOINT_OPEN_TAG: compiler.CHECKPOINT_OPEN_TAG,
    CHECKPOINT_CLOSE_TAG: compiler.CHECKPOINT_CLOSE_TAG,
    // --- compaction transaction state, over a plain events array
    inspectCompactionEntryState: region.inspectCompactionEntryState,
  };
}

/**
 * Import layer C: the Thursday install engine, for the doctor's drift report.
 *
 * `packages/install` is TypeScript whose sources use extensionless relative
 * imports (`from "./actions"`), which Node's ESM type-stripping resolver
 * rejects. Rather than duplicate its rules — the exact failure mode this
 * ticket forbids — we bundle it on demand with the repo's own esbuild and
 * import the bundle, so the doctor calls the REAL `DETECT_ACTIONS`,
 * `runDetectStep`, `detectBlockStatus` and `loadBlockFile`.
 *
 * @param {{repoRoot: string, cacheDir?: string}} opts
 */
export async function loadInstallEngine(opts) {
  const repoRoot = opts.repoRoot;
  const pkgDir = path.join(repoRoot, "packages/install");
  if (!fs.existsSync(path.join(pkgDir, "src/index.ts"))) {
    throw new ResolutionError("@trythursday/install sources", [
      `${path.join(pkgDir, "src/index.ts")} does not exist`,
    ]);
  }
  const esbuild = path.join(repoRoot, "node_modules/.bin/esbuild");
  if (!fs.existsSync(esbuild)) {
    throw new ResolutionError("esbuild (needed to bundle @trythursday/install)", [
      `${esbuild} does not exist — run pnpm install in ${repoRoot}`,
    ]);
  }
  const cacheDir = opts.cacheDir ?? path.join(process.env.TMPDIR ?? "/tmp/dsh", "thursday-session-cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  // Entry re-exports the block layer AND the executor's detect functions.
  // install.ts is in-flight work (untracked at time of writing), so its
  // absence degrades to "block layer only" rather than failing the doctor.
  const hasExecutor = fs.existsSync(path.join(pkgDir, "src/install.ts"));
  const entry = path.join(cacheDir, "install-entry.mts");
  fs.writeFileSync(
    entry,
    [
      `export * from ${JSON.stringify(path.join(pkgDir, "src/index.ts"))};`,
      hasExecutor
        ? `export { runDetectStep, detectBlockStatus, resolveThursdayHome, createFilesystemAPI } from ${JSON.stringify(path.join(pkgDir, "src/install.ts"))};`
        : `export const runDetectStep = undefined, detectBlockStatus = undefined, resolveThursdayHome = undefined, createFilesystemAPI = undefined;`,
      "",
    ].join("\n"),
    "utf8",
  );
  const out = path.join(cacheDir, "install-bundle.mjs");
  // NOT `--packages=external`: the bundle is written to a cache directory
  // OUTSIDE the repo, so bare imports like `zod` and `yaml` would not resolve
  // from there. `--platform=node` already keeps `node:` builtins external, so
  // this produces a self-contained bundle that runs from anywhere.
  // The banner supplies a real `require` to the ESM bundle. `packages/install`
  // pulls in execa, whose dependency tree still does `require("process")`; in
  // an ESM bundle that becomes esbuild's "Dynamic require ... is not supported"
  // shim and throws at import time. A `createRequire` bound to the bundle's own
  // URL resolves node builtins from anywhere, which is all those calls need.
  const banner =
    "import{createRequire as __dshCreateRequire}from'node:module';" +
    "const require=__dshCreateRequire(import.meta.url);";
  execFileSync(
    esbuild,
    [entry, "--bundle", "--platform=node", "--format=esm", `--banner:js=${banner}`, `--outfile=${out}`],
    { cwd: pkgDir, stdio: "pipe" },
  );
  if (!fs.existsSync(out)) {
    throw new ResolutionError("the bundled @trythursday/install", [
      `esbuild reported success but ${out} does not exist (is the cache dir writable?)`,
    ]);
  }
  const mod = await import(`${out}?v=${fs.statSync(out).mtimeMs}`);
  return { origin: { package: "@trythursday/install", pkgDir, bundle: out, hasExecutor }, ...mod };
}

/** Node's `require` bound to this module, for callers that need CJS interop. */
export const requireFrom = createRequire(import.meta.url);
