/**
 * IMPORT existing dsh sessions into a Thursday home (#233).
 *
 * IMPORT NEVER MOVES OR MUTATES THE ORIGINALS. E6 promises Thursday does not
 * touch an existing dsh installation, and this is the feature most likely to
 * break that promise, because the obvious implementation moves files. Every
 * operation here opens source files `r` only and writes exclusively under the
 * DESTINATION and QUARANTINE roots. The user's `~/.dsh` is byte-identical
 * afterwards, failure or not.
 *
 * THE TREE IS THE UNIT, NOT THE SESSION. Selecting any member imports its
 * whole delegation tree — parent plus every descendant — so no import can
 * orphan a child or truncate a tree. The selection list SHOWS the trees so the
 * choice is still the user's (#233).
 *
 * SELECTION IS THE USER'S. Nothing is imported by default: an unattended run
 * imports zero sessions. 719 MB is not a thing to copy silently.
 *
 * "IMPORTED" MEANS READABLE: an imported session must be reachable by
 * `thursday session list/show/search/recall/fold`. A log that is malformed —
 * no header, a line that will not parse, a torn container — is QUARANTINED to
 * the destination side and COUNTED, never dropped silently and never fatal to
 * the run.
 *
 * Both observed directory shapes (`session-<uuid>` and bare `<uuid>`) import;
 * `.superseded-<iso>` siblings left by `repair` never do.
 *
 * No dependency on the dsh session model or the compaction fork: an import
 * must work on a machine where neither is resolvable. Structural validation is
 * JSON-level plus the container walk from `read.mjs`; the deeper "is it
 * readable" proof is `tests/run-tests.mjs` running the real session tools over
 * the imported copy.
 */
import fs from "node:fs";
import path from "node:path";

import { readArtifact, readHeaderOnly, checksumFile, LOG_SUFFIXES } from "./read.mjs";
import {
  normalizeSessionId,
  supersededSuffix,
  isSessionDirName,
  classifyHeader,
  classifyState,
  resolveTitle,
  buildSessionTrees,
} from "./classify.mjs";

/**
 * Why a log is not importable, or `null` when it is. STRICT on purpose: a log
 * with any structural defect is quarantined and counted rather than imported
 * half-readable — "an import that quietly drops eleven sessions is worse than
 * one that refuses" (#233).
 *
 * @param {string} file
 * @returns {Promise<{ok: boolean, reason: string|null, issues: Array<{code: string, message: string}>}>}
 */
export async function inspectLog(file) {
  let artifact;
  try {
    artifact = await readArtifact(file);
  } catch (e) {
    return { ok: false, reason: `unreadable: ${e.message}`, issues: [] };
  }
  const issues = artifact.issues.map((i) => ({ code: i.code, message: i.message }));
  for (const i of artifact.issues) {
    if (i.code === "zstd-torn-tail" || i.code === "zstd-no-progress") {
      return { ok: false, reason: `torn container: ${i.message}`, issues };
    }
  }
  const lines = artifact.plaintext.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  else issues.push({ code: "no-trailing-newline", message: "the last line has no trailing newline — a torn final record" });
  if (lines.length === 0) return { ok: false, reason: "empty log", issues };
  let header = null;
  try {
    header = JSON.parse(lines[0]);
  } catch (e) {
    return { ok: false, reason: `line 1 is not valid JSON: ${e.message}`, issues };
  }
  if (header?.type !== "session") {
    return { ok: false, reason: `line 1 is not a session header record (its type is ${JSON.stringify(header?.type)})`, issues };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].length === 0) continue;
    try {
      JSON.parse(lines[i]);
    } catch (e) {
      return { ok: false, reason: `line ${i + 1} is not valid JSON: ${e.message}`, issues };
    }
  }
  if (issues.some((i) => i.code === "no-trailing-newline")) {
    return { ok: false, reason: "no trailing newline — the final record may be torn", issues };
  }
  return { ok: true, reason: null, issues };
}

/**
 * Scan a source dsh home's sessions root: every session, classified and
 * titled, grouped into trees, with `.superseded` siblings listed separately.
 *
 * Layout walked: `<sourceRoot>/<workspace>/<sessionDir>/session.jsonl[.zstd]`,
 * where `<sessionDir>` is `session-<uuid>` OR bare `<uuid>` (both real).
 *
 * @param {string} sourceRoot e.g. `~/.dsh/sessions`
 * @param {{archivedIds?: Set<string>|string[]}} [opts]
 */
export async function scanImportSource(sourceRoot, opts = {}) {
  const sessions = [];
  const superseded = [];
  let workspaces = [];
  try {
    workspaces = fs
      .readdirSync(sourceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      // readdir order is filesystem-dependent; sort so scans and reports are
      // deterministic across machines and across runs.
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return { sourceRoot, sessions, superseded, trees: [], workspaces: [] };
  }
  for (const ws of workspaces) {
    const wsDir = path.join(sourceRoot, ws.name);
    let entries = [];
    try {
      entries = fs.readdirSync(wsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }
    for (const e of entries) {
      const dir = path.join(wsDir, e.name);
      if (supersededSuffix(e.name)) {
        // A `.superseded-<iso>` session directory — never a session.
        superseded.push({ file: dir, bytes: 0, workspace: ws.name });
        continue;
      }
      if (!e.isDirectory()) continue;
      if (!isSessionDirName(e.name)) continue;
      let files = [];
      try {
        files = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      let logFile = null;
      for (const f of files) {
        if (!f.isFile()) continue;
        if (supersededSuffix(f.name)) {
          superseded.push({ file: path.join(dir, f.name), bytes: fs.statSync(path.join(dir, f.name)).size, workspace: ws.name });
          continue;
        }
      }
      // A directory holding both shapes (a repair can leave one behind)
      // resolves by LOG_SUFFIXES priority — compressed first — never by
      // readdir order.
      for (const suffix of LOG_SUFFIXES) {
        const candidate = path.join(dir, `session${suffix}`);
        if (fs.existsSync(candidate)) {
          logFile = candidate;
          break;
        }
      }
      if (logFile === null) continue;
      const st = fs.statSync(logFile);
      const header = await readHeaderOnly(logFile).catch(() => undefined);
      const verdict = await inspectLog(logFile);
      const lines = verdict.ok
        ? (await readArtifact(logFile).catch(() => ({ plaintext: "" }))).plaintext.split("\n")
        : [];
      const cls = classifyHeader(header ?? null);
      sessions.push({
        sessionId: e.name,
        id: normalizeSessionId(e.name),
        workspace: ws.name,
        dir,
        file: logFile,
        logName: path.basename(logFile),
        bytes: st.size,
        mtime: st.mtimeMs,
        modified: new Date(st.mtimeMs).toISOString(),
        header,
        title: resolveTitle(lines),
        origin: cls.origin,
        delegationDepth: cls.delegationDepth,
        parent: cls.parent,
        state: classifyState({ sessionId: e.name, file: logFile }, opts.archivedIds),
        importable: verdict.ok,
        quarantineReason: verdict.reason,
      });
    }
  }
  const trees = buildSessionTrees(sessions.map((s) => ({ sessionId: s.id, parent: s.parent })));
  return { sourceRoot, sessions, superseded, trees, workspaces: workspaces.map((w) => w.name) };
}

/**
 * Resolve a user selection to the SESSIONS TO IMPORT. A selection names any
 * member of a tree and lands the whole tree — parent and every descendant —
 * so an import can never orphan a child or leave a parent's work split.
 * Matching is by full or unique-prefix id, like every other session reference.
 *
 * @param {Array} sessions scanImportSource().sessions
 * @param {Array} trees scanImportSource().trees
 * @param {string[]} select user-picked ids; empty means NOTHING
 * @returns {{entries: Array, selectedIds: string[]}} entries to import
 */
export function resolveSelection(sessions, trees, select) {
  const wanted = (select ?? []).flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  if (wanted.length === 0) return { entries: [], selectedIds: [] };
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const importIds = new Set();
  const selectedIds = [];
  for (const w of wanted) {
    const exact = byId.get(normalizeSessionId(w));
    const hit = exact ?? [...byId.values()].filter((s) => s.id.startsWith(normalizeSessionId(w)) || s.sessionId.startsWith(w));
    const matches = Array.isArray(hit) ? hit : [hit];
    if (matches.length === 0) throw new Error(`no session matching "${w}" in the source`);
    if (matches.length > 1) {
      throw new Error(`"${w}" matches ${matches.length} sessions:\n` + matches.slice(0, 10).map((m) => `  ${m.sessionId}`).join("\n"));
    }
    const m = matches[0];
    selectedIds.push(m.sessionId);
    const tree = trees.find((t) => t.members.includes(m.id));
    for (const id of tree ? tree.members : [m.id]) importIds.add(id);
  }
  return { entries: sessions.filter((s) => importIds.has(s.id)), selectedIds };
}

/**
 * Run an import. Copies (never moves) each selected session's directory
 * contents — except `.superseded-<iso>` siblings — under the destination root,
 * preserving the workspace directory. Destination session directories take the
 * BARE id regardless of the source shape, so both observed shapes land
 * canonical and `thursday session <id>` resolves them by exact id.
 *
 * Malformed logs go to `<quarantineRoot>/<workspace>/<sourceDirName>/` and are
 * counted. A copy failure ABORTS with the partial report attached — the source
 * is untouched either way.
 *
 * @param {{sourceRoot: string, destRoot: string, quarantineRoot?: string,
 *          select: string[], dryRun?: boolean, archivedIds?: Set<string>|string[]}} opts
 * @returns {Promise<object>} the import report
 */
export async function runImport(opts) {
  const { sourceRoot, destRoot, select } = opts;
  const quarantineRoot = opts.quarantineRoot ?? path.join(path.dirname(destRoot), "quarantine");
  // An import writes ONLY outside the source tree. A destination or quarantine
  // root inside the source would put writes under the very tree the
  // byte-identity promise covers — refuse the configuration outright (#233).
  const inside = (parent, child) => {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (inside(sourceRoot, destRoot) || inside(sourceRoot, quarantineRoot)) {
    throw new Error(
      `refusing to import: the destination or quarantine root is inside the source tree (${sourceRoot}); ` +
        `an import must never write under its own source`,
    );
  }
  const scan = await scanImportSource(sourceRoot, { archivedIds: opts.archivedIds });
  const { entries, selectedIds } = resolveSelection(scan.sessions, scan.trees, select);
  // `session-<id>/` and `<id>/` can sit side by side. One id, one import:
  // first wins, the rest are counted, never silently double-imported.
  const seenIds = new Set();
  const duplicates = [];
  const uniqueEntries = [];
  for (const s of entries) {
    if (seenIds.has(s.id)) {
      duplicates.push(s.sessionId);
      continue;
    }
    seenIds.add(s.id);
    uniqueEntries.push(s);
  }
  const report = {
    sourceRoot,
    destRoot,
    quarantineRoot,
    dryRun: !!opts.dryRun,
    selected: selectedIds,
    imported: [],
    quarantined: [],
    skippedSuperseded: scan.superseded.map((s) => ({ file: s.file, bytes: s.bytes })),
    duplicatesSkipped: duplicates,
    counts: {
      selected: selectedIds.length,
      trees: new Set(uniqueEntries.map((e) => scan.trees.find((t) => t.members.includes(e.id))?.treeId)).size,
      imported: 0,
      quarantined: 0,
      superseded: scan.superseded.length,
      duplicates: duplicates.length,
    },
  };
  for (const s of uniqueEntries) {
    if (!s.importable) {
      const qDir = path.join(quarantineRoot, s.workspace, s.sessionId);
      if (!opts.dryRun) {
        fs.mkdirSync(qDir, { recursive: true });
        const qFile = path.join(qDir, s.logName);
        fs.copyFileSync(s.file, qFile);
        fs.writeFileSync(
          path.join(qDir, "quarantine.json"),
          JSON.stringify({ sessionId: s.sessionId, source: s.file, reason: s.quarantineReason }, null, 2) + "\n",
        );
      }
      report.quarantined.push({ sessionId: s.sessionId, workspace: s.workspace, file: s.file, reason: s.quarantineReason });
      report.counts.quarantined += 1;
      continue;
    }
    const destDir = path.join(destRoot, s.workspace, s.id);
    const destLog = path.join(destDir, s.logName);
    try {
      if (!opts.dryRun) {
        fs.mkdirSync(destDir, { recursive: true });
        for (const f of fs.readdirSync(s.dir, { withFileTypes: true })) {
          if (!f.isFile() || supersededSuffix(f.name)) continue;
          fs.copyFileSync(path.join(s.dir, f.name), path.join(destDir, f.name));
        }
        if (checksumFile(destLog) !== checksumFile(s.file)) {
          throw new Error(`copy verification failed for ${s.sessionId}: destination checksum differs from source`);
        }
      }
      report.imported.push({
        sessionId: s.sessionId,
        id: s.id,
        workspace: s.workspace,
        sourceDir: s.dir,
        sourceFile: s.file,
        destDir,
        destFile: destLog,
        bytes: s.bytes,
        title: s.title,
        checksum: opts.dryRun ? null : checksumFile(destLog),
      });
      report.counts.imported += 1;
    } catch (e) {
      report.aborted = { sessionId: s.sessionId, error: e.message };
      const err = new Error(`import aborted at ${s.sessionId}: ${e.message}. The source was not modified.`);
      err.report = report;
      throw err;
    }
  }
  return report;
}
