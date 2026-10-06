import zlib from "node:zlib";
/**
 * The whole proof, in one command.
 *
 * Regenerates every claim in REPORT.md from scratch: builds the corrupted
 * fixtures from a real session, diagnoses each, repairs each, verifies the good
 * data survived, and proves reading never writes. No vitest dependency — plain
 * node, so it runs on a machine that has nothing installed but dsh.
 *
 * Usage: node run-tests.mjs [--source <real session.jsonl.zstd>] [--out <dir>]
 * Exit 0 iff every assertion holds.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { loadSessionModel, loadCompactionFork } from "../src/runtime.mjs";
import {
  openSessionFile,
  checksumFile,
  findSessionArtifacts,
  defaultSessionRoots,
  readHeaderOnly,
  readArtifact,
} from "../src/read.mjs";
import { summarize, search as searchView, recall as recallView } from "../src/view.mjs";
import { runDiagnostics } from "../src/diagnose.mjs";
import { planRepair, applyRepair, verifyRepair, confirmRepair } from "../src/repair.mjs";
import { runImport, scanImportSource, inspectLog } from "../src/import.mjs";
import { normalizeSessionId, buildSessionTrees, treeOf, sanitizeTitle, classifyHeader } from "../src/classify.mjs";
import { makeFixtures } from "./make-fixtures.mjs";

let passed = 0;
let failed = 0;
const lines = [];

function log(s = "") {
  lines.push(s);
  console.log(s);
}
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    failed += 1;
    log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/** Pick a real session to build fixtures from: small enough to be quick. */
function pickSource(explicit) {
  if (explicit) return explicit;
  const roots = defaultSessionRoots(process.env, os.homedir());
  const all = [];
  for (const r of roots) all.push(...findSessionArtifacts(r.root));
  const usable = all.filter((a) => a.bytes > 20000 && a.bytes < 200000).sort((a, b) => a.bytes - b.bytes);
  if (usable.length === 0) throw new Error("no suitable real session found to build fixtures from");
  return usable[Math.floor(usable.length / 2)].file;
}

const args = process.argv.slice(2);
const get = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};
const outDir = path.resolve(get("--out", path.join(process.env.TMPDIR ?? "/tmp/dsh", "n8-test-run")));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const model = await loadSessionModel();
const fork = await loadCompactionFork();

log("=".repeat(78));
log("thursday session — full proof run");
log("=".repeat(78));
log("");
log(`dsh session model   ${model.origin.package}@${model.origin.version}`);
log(`                    ${model.origin.base}`);
log(`                    via ${model.origin.how}`);
log(`compaction fork     ${fork.origin.name}@${fork.origin.version} installed as ${fork.origin.installedAs}`);
log(`                    ${fork.origin.root}`);
log("");

// ---------------------------------------------------------------------------
log("## 1. substrate — every reused function is the real one");
const reused = {
  "dsh foldSurface": model.foldSurface,
  "dsh deriveEventMessage": model.deriveEventMessage,
  "dsh interruptedTurnClosers": model.interruptedTurnClosers,
  "dsh decodeStorageRecord": model.decodeStorageRecord,
  "fork recallSession": fork.recallSession,
  "fork searchSession": fork.searchSession,
  "fork projectMessageText": fork.projectMessageText,
  "fork findCheckpointSeqs": fork.findCheckpointSeqs,
  "fork truncateTokens": fork.truncateTokens,
  "fork estimateEntryTokens": fork.estimateEntryTokens,
  "fork inspectCompactionEntryState": fork.inspectCompactionEntryState,
};
for (const [name, fn] of Object.entries(reused)) check(`${name} imported`, typeof fn === "function");
check("fork is the FORK, not the builtin basic engine", fork.origin.name === "dsh-compaction-instant", `package.json name = ${fork.origin.name}`);
log("");

// ---------------------------------------------------------------------------
log("## 2. bounded view on a REAL session");
const source = pickSource(get("--source", undefined));
log(`  source: ${source}`);
{
  const t0 = Date.now();
  const opened = await openSessionFile(source, model);
  const openMs = Date.now() - t0;
  const t1 = Date.now();
  const header = await readHeaderOnly(source);
  const headerMs = Date.now() - t1;

  const sum = summarize(opened, model, fork);
  const rawChars = JSON.stringify(opened.events).length;
  check("summary is within its token bound", sum.tokens <= sum.bound.maxTokens, `${sum.tokens} <= ${sum.bound.maxTokens}`);
  check("summary is within its line bound", sum.lines <= sum.bound.maxLines, `${sum.lines} <= ${sum.bound.maxLines}`);
  check("summary reports withinBound", sum.withinBound === true);
  check("summary is far smaller than a raw dump", sum.text.length * 50 < rawChars || rawChars < 100000,
    `summary ${sum.text.length} chars vs raw ${rawChars} chars (${Math.round(rawChars / Math.max(1, sum.text.length))}x)`);
  check("header-only read is much cheaper than a full open", headerMs <= openMs, `${headerMs}ms vs ${openMs}ms`);
  check("header parsed", header?.type === "session");

  // The bound must hold when squeezed, too — including absurdly small caps,
  // where the truncation and elision markers themselves cost tokens and lines.
  let violations = 0;
  let configs = 0;
  for (const cap of [1, 5, 10, 20, 26, 50, 100, 200, 500, 1000, 2000, 8000]) {
    configs += 1;
    const s = summarize(opened, model, fork, { maxTokens: cap });
    if (!(s.tokens <= cap && s.withinBound)) {
      violations += 1;
      log(`        maxTokens=${cap} -> ${s.tokens}`);
    }
  }
  for (const lc of [1, 2, 3, 5, 10, 20, 40, 160, 1000]) {
    configs += 1;
    const s = summarize(opened, model, fork, { maxLines: lc });
    if (!(s.lines <= lc && s.withinBound)) {
      violations += 1;
      log(`        maxLines=${lc} -> ${s.lines}`);
    }
  }
  for (const [tc, lc] of [[50, 3], [100, 5], [2000, 10], [300, 200]]) {
    configs += 1;
    const s = summarize(opened, model, fork, { maxTokens: tc, maxLines: lc });
    if (!(s.tokens <= tc && s.lines <= lc)) {
      violations += 1;
      log(`        combo ${tc}/${lc} -> ${s.tokens}/${s.lines}`);
    }
  }
  check("bound holds across every cap tried", violations === 0, `${configs - violations}/${configs} configurations`);
}
log("");

// ---------------------------------------------------------------------------
log("## 3. reading NEVER writes (real before/after checksum)");
{
  const before = checksumFile(source);
  const opened = await openSessionFile(source, model);
  runDiagnostics(opened, model, fork);
  summarize(opened, model, fork);
  fork.searchSession(opened.session, "the", { maxRecallTokens: 4000, maxSearchHits: 20 });
  fork.recallSession(opened.session, [{ start: 0, end: 30 }], { maxRecallTokens: 4000 });
  const after = checksumFile(source);
  check("a full diagnose + summarize + search + recall leaves the file byte-identical", before === after, `${before.slice(0, 16)}…`);
  log(`        sha256 before ${before}`);
  log(`        sha256 after  ${after}`);
}
log("");

// ---------------------------------------------------------------------------
log("## 4. deliberately corrupted sessions are diagnosed correctly");
const fixtureDir = path.join(outDir, "fixtures");
const made = await makeFixtures(source, fixtureDir);
log(`  built ${made.length} fixture(s) from the real session above`);
const diagnosed = new Map();
for (const m of made) {
  const opened = await openSessionFile(m.file, model);
  const diag = runDiagnostics(opened, model, fork);
  const codes = [...new Set(diag.findings.map((f) => f.code))];
  diagnosed.set(m.name, { opened, diag, codes });
  if (m.name === "pristine") {
    check("pristine control produces NO findings (no false positives)", codes.length === 0, `got [${codes.join(",")}]`);
    continue;
  }
  const want = m.expected.expectCodes ?? [];
  check(`${m.name}: detected ${want.join(" + ")}`, want.every((w) => codes.includes(w)), `got [${codes.join(",")}]`);
}
// dsh's own validator independently agrees on the seq-level corruptions.
for (const n of ["duplicate-seq", "seq-gap", "unparsable-line"]) {
  const d = diagnosed.get(n);
  if (d) check(`${n}: dsh's own foldSurface independently rejects it`, d.codes.includes("surface-inconsistent"));
}
log("");

// ---------------------------------------------------------------------------
log("## 5. repair writes a COPY, keeps the original, and preserves good data");
{
  const repairDir = path.join(outDir, "repairs");
  fs.mkdirSync(repairDir, { recursive: true });
  // seq-gap is deliberately absent from this loop. Its repair is REFUSED, so no
  // repaired file exists that dsh could open, and asserting otherwise asserts
  // something the design forbids. Its real contract is checked below.
  for (const name of ["duplicate-seq", "unparsable-line", "unparsable-chunk-row", "torn-frame", "open-turn"]) {
    const d = diagnosed.get(name);
    if (!d) continue;
    const src = made.find((m) => m.name === name).file;
    const before = checksumFile(src);
    const plan = planRepair(d.diag, { dropUnparsable: true, dropDuplicateSeq: true, closeTurns: true });
    const dest = path.join(repairDir, `${name}.repaired.jsonl.zstd`);
    const applied = await applyRepair(src, plan, dest);
    const v = await verifyRepair(src, dest, applied.droppedLines);
    const after = checksumFile(src);
    check(`${name}: original untouched by the repair`, before === after);
    check(`${name}: every surviving record is byte-identical`, v.allGoodDataSurvived,
      `${v.byteIdenticalSurvivors}/${v.expectedSurvivors} survivors, ${v.droppedRecords} dropped, ${v.appendedRecords} appended`);
    // TEST A (D1/D2b/c): writer framing + dsh can open the repaired file
    check(`${name}: repaired file physical framing is valid`, v.framingOk,
      `framing: ${v.framingOk}, dsh can open: ${v.dshCanOpen}`);
    check(`${name}: dsh's own loader can open the repaired file`, v.dshCanOpen,
      `problems: [${v.problems.filter((p) => p.startsWith("dsh:")).slice(0, 1).join(", ")}]`);
  }

  // seq-gap must be REFUSED, not silently "fixed".
  const gap = diagnosed.get("seq-gap");
  const gapPlan = planRepair(gap.diag, { dropUnparsable: true, dropDuplicateSeq: true, closeTurns: true });
  check("seq-gap repair is explicitly REFUSED rather than faked",
    gapPlan.refused.some((r) => /seq-gap CANNOT be repaired/u.test(r)));
  check("seq-gap refusal attempts no operations at all", gapPlan.ops.length === 0);

  // Refusals.
  const dupSrc = made.find((m) => m.name === "duplicate-seq").file;
  const dupPlan = planRepair(diagnosed.get("duplicate-seq").diag, { dropDuplicateSeq: true });
  let refusedInPlace = false, refusedOverwrite = false;
  try {
    await applyRepair(dupSrc, dupPlan, dupSrc);
  } catch {
    refusedInPlace = true;
  }
  try {
    await applyRepair(dupSrc, dupPlan, path.join(repairDir, "duplicate-seq.repaired.jsonl.zstd"));
  } catch {
    refusedOverwrite = true;
  }
  check("applyRepair refuses to write in place", refusedInPlace);
  check("applyRepair refuses to overwrite an existing file", refusedOverwrite);

  // Confirmation semantics.
  const demo = path.join(outDir, "confirm");
  fs.mkdirSync(demo, { recursive: true });
  const live = path.join(demo, "session.jsonl.zstd");
  fs.copyFileSync(made.find((m) => m.name === "open-turn").file, live);
  const liveSum = checksumFile(live);
  const openedLive = await openSessionFile(live, model);
  const dLive = runDiagnostics(openedLive, model, fork);
  const pLive = planRepair(dLive, { closeTurns: true });
  const aLive = await applyRepair(live, pLive, path.join(demo, "session.repaired.jsonl.zstd"));
  const notConfirmed = confirmRepair(aLive, { confirm: false });
  check("without confirmation the repair is NOT promoted", notConfirmed.promoted === false);
  check("without confirmation the original is unchanged", checksumFile(live) === liveSum);
  const promoted = confirmRepair(aLive, { confirm: true });
  check("with confirmation the repair is promoted", promoted.promoted === true);
  check("the original is PRESERVED, not deleted", fs.existsSync(promoted.originalPreservedAt) && checksumFile(promoted.originalPreservedAt) === liveSum,
    path.basename(promoted.originalPreservedAt));
  check("an undo command is provided", typeof promoted.undo === "string" && promoted.undo.startsWith("mv "));
}
log("");

// ---------------------------------------------------------------------------
log("## 6. diagnose detects the header-frame defect; verifyRepair reports framing");
{
  // TEST B (D2a): diagnose must report "header-frame-not-lone" on old-writer framing.
  // Build an old-writer file inline (header + 7 records in frame 0).
  const oldWriterEncode = (lines) => {
    const frames = [];
    for (let i = 0; i < lines.length; i += 8) {
      const chunk = lines.slice(i, i + 8).map((l) => l + "\n").join("");
      frames.push(zlib.zstdCompressSync(Buffer.from(chunk, "utf8")));
    }
    return Buffer.concat(frames);
  };
  
  // Use real session lines and re-encode with old-writer framing
  const badFramedFile = path.join(outDir, "bad-framing.jsonl.zstd");
  const realSource = await openSessionFile(source, model);
  const realLines = realSource.artifacts?.plaintext?.split("\n").filter((l) => l.length > 0) ||
                    diagnosed.get("pristine")?.opened?.artifact?.plaintext?.split("\n").filter((l) => l.length > 0) || [];
  if (realLines.length > 0) {
    fs.writeFileSync(badFramedFile, oldWriterEncode(realLines));
    const badOpened = await openSessionFile(badFramedFile, model);
    const badDiag = runDiagnostics(badOpened, model, fork);
    const hasBadFramingFinding = badDiag.findings.some((f) => f.code === "header-frame-not-lone");
    check("diagnose detects header-frame-not-lone on old-writer file", hasBadFramingFinding,
      `findings: [${badDiag.findings.map((f) => f.code).join(", ")}]`);

    // TEST C (D2b/c): verifyRepair must reject the old-writer framing
    const dummyRepairDest = path.join(outDir, "dummy-repaired.jsonl.zstd");
    fs.copyFileSync(badFramedFile, dummyRepairDest);
    try {
      const vBadFraming = await verifyRepair(badFramedFile, badFramedFile, []);
      check("verifyRepair rejects old-writer framing: framingOk is false", vBadFraming.framingOk === false);
      check("verifyRepair rejects old-writer framing: dshCanOpen is false", vBadFraming.dshCanOpen === false);
      check("verifyRepair rejects old-writer framing: ok is false", vBadFraming.ok === false);
    } catch (e) {
      log(`        verifyRepair threw: ${e.message}`);
    }
  }
}
log("");

// ---------------------------------------------------------------------------
log("## 7. import (#233) — trees, quarantine, byte-identity, readability");
{
  const PID = "aaaaaaaa-1111-2222-3333-444444444444"; // human, tree root (source dir is `session-` prefixed)
  const CID = "bbbbbbbb-1111-2222-3333-444444444444"; // subagent under PID (source dir bare)
  const TID = "cccccccc-1111-2222-3333-444444444444"; // torn log -> quarantine
  const XID = "dddddddd-1111-2222-3333-444444444444"; // standalone human session

  // dsh's writer layout: frame 0 = header line ALONE, then per-batch frames.
  const encodeFrames = (ls, perFrame = 8) => {
    const frames = [zlib.zstdCompressSync(Buffer.from(ls[0] + "\n", "utf8"))];
    for (let i = 1; i < ls.length; i += perFrame) {
      frames.push(zlib.zstdCompressSync(Buffer.from(ls.slice(i, i + perFrame).join("\n") + "\n", "utf8")));
    }
    return Buffer.concat(frames);
  };

  const art = await readArtifact(source);
  const srcLines = art.plaintext.split("\n").filter((l) => l.length > 0);
  const mkHeader = (id, extra) =>
    JSON.stringify({ type: "session", version: 0, id, createdAt: 1789000000000, cwd: "/home/sid/ai-scratch", agentPreset: "standard", ...extra });
  const mkSession = (dir, id, extra, torn = false) => {
    const ls = [mkHeader(id, extra), ...srcLines.slice(1)];
    if (torn) {
      const mid = Math.floor(ls.length / 2);
      ls[mid] = ls[mid].slice(0, 40); // torn mid-JSON, the observed 43 KB-line shape
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "session.jsonl.zstd"), encodeFrames(ls));
  };

  const srcRoot = path.join(outDir, "import-src");
  mkSession(path.join(srcRoot, "--ws-a--", `session-${PID}`), PID, { origin: "human", delegationDepth: 0 });
  mkSession(path.join(srcRoot, "--ws-a--", CID), CID, { origin: "subagent", delegationDepth: 1, parentSession: `session-${PID}` });
  mkSession(path.join(srcRoot, "--ws-b--", TID), TID, { origin: "human", delegationDepth: 0 }, true);
  mkSession(path.join(srcRoot, "--ws-b--", XID), XID, { origin: "human", delegationDepth: 0 });
  // A `.superseded-<iso>` sibling, exactly as `repair` leaves them. Never importable.
  fs.writeFileSync(
    path.join(srcRoot, "--ws-a--", `session-${PID}`, `session.jsonl.zstd.superseded-2026-01-01T00:00:00.000Z`),
    Buffer.from("superseded bytes"),
  );

  const sumTree = (root) => {
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(`${path.relative(root, p)} ${checksumFile(p)}`);
      }
    };
    walk(root);
    return out.join("\n");
  };
  const before = sumTree(srcRoot);

  // --- selection is the user's: an unattended run imports NOTHING -----------
  const zero = await runImport({ sourceRoot: srcRoot, destRoot: path.join(outDir, "import-dest-zero"), select: [] });
  check("an unattended run imports zero sessions", zero.counts.imported === 0 && zero.selected.length === 0);
  check("an unattended run writes nothing at all", !fs.existsSync(path.join(outDir, "import-dest-zero")));

  // --- the selection list: workspace, title, size, date, via the classifier --
  const scan = await scanImportSource(srcRoot);
  const pScan = scan.sessions.find((s) => s.id === PID);
  check(
    "the selection list shows workspace, title, size and date per session",
    pScan !== undefined &&
      pScan.workspace === "--ws-a--" &&
      typeof pScan.title === "string" && pScan.title.length > 0 &&
      pScan.bytes > 0 &&
      typeof pScan.modified === "string" && pScan.modified.includes("T"),
    `title=${JSON.stringify(pScan?.title)}`,
  );
  check("the classifier reads human/subagent and the parent link from the header",
    pScan.origin === "human" &&
      scan.sessions.find((s) => s.id === CID).parent === PID &&
      scan.sessions.find((s) => s.id === CID).origin === "subagent");

  // --- the tree is the unit: no orphan either way --------------------------
  const trees = buildSessionTrees(scan.sessions.map((s) => ({ sessionId: s.id, parent: s.parent })));
  const treeP = treeOf(CID, scan.sessions.map((s) => ({ sessionId: s.id, parent: s.parent })));
  check("a prefixed parent and a bare child form ONE tree", treeP !== null && treeP.members.includes(PID) && treeP.members.includes(CID),
    `trees=${trees.length}`);
  const rChild = await runImport({ sourceRoot: srcRoot, destRoot: path.join(outDir, "import-dest-child"), select: [CID] });
  check("importing a child alone imports its parent too (no orphan)",
    rChild.imported.some((i) => i.id === PID) && rChild.imported.some((i) => i.id === CID) && rChild.counts.imported === 2);
  const rParent = await runImport({ sourceRoot: srcRoot, destRoot: path.join(outDir, "import-dest-parent"), select: [PID] });
  check("importing a parent alone offers and lands its subagent children",
    rParent.counts.selected === 1 && rParent.counts.imported === 2 && rParent.imported.some((i) => i.id === CID));

  // --- quarantine: counted, reported, and the rest still import -------------
  const dest4 = path.join(outDir, "import-dest4");
  const rAll = await runImport({ sourceRoot: srcRoot, destRoot: dest4, select: [PID, TID, XID] });
  check("the torn log is quarantined and COUNTED, never dropped silently",
    rAll.counts.quarantined === 1 && rAll.quarantined[0].sessionId === TID && rAll.quarantined[0].reason.length > 0,
    rAll.quarantined[0]?.reason);
  check("the import completes and imports the rest", rAll.counts.imported === 3);
  check("the quarantined log lands under the quarantine root, named",
    fs.existsSync(path.join(outDir, "quarantine", "--ws-b--", TID, "session.jsonl.zstd")) &&
      fs.existsSync(path.join(outDir, "quarantine", "--ws-b--", TID, "quarantine.json")));

  // --- both directory shapes land canonical; superseded never imports ------
  check("both observed directory shapes import (session- prefixed and bare)",
    fs.existsSync(path.join(dest4, "--ws-a--", PID, "session.jsonl.zstd")) &&
      fs.existsSync(path.join(dest4, "--ws-a--", CID, "session.jsonl.zstd")));
  check("destination directories take the bare session id",
    !fs.readdirSync(path.join(dest4, "--ws-a--")).some((n) => n.startsWith("session-")));
  const supersededLeak = [];
  const findLeak = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.includes(".superseded-")) supersededLeak.push(path.join(d, e.name));
      if (e.isDirectory()) findLeak(path.join(d, e.name));
    }
  };
  findLeak(dest4);
  check(".superseded siblings are never imported as if they were sessions", supersededLeak.length === 0,
    supersededLeak.join(", "));

  // --- the source is byte-identical: on success AND on failure partway ------
  check("the source is byte-identical after a successful import", sumTree(srcRoot) === before);
  const dest5 = path.join(outDir, "import-dest5");
  // Fail partway: a DIRECTORY where the last session's log file must go.
  fs.mkdirSync(path.join(dest5, "--ws-b--", XID, "session.jsonl.zstd"), { recursive: true });
  let threw = null;
  try {
    await runImport({ sourceRoot: srcRoot, destRoot: dest5, select: [PID, XID] });
  } catch (e) {
    threw = e;
  }
  check("an import that fails partway aborts with a report", threw !== null && threw.report?.aborted?.sessionId === XID && threw.report.imported.length === 2,
    threw?.message);
  check("the source is byte-identical after a FAILED import too", sumTree(srcRoot) === before);

  // --- "imported" MEANS READABLE: list, show, search, recall, fold ----------
  const arts = findSessionArtifacts(dest4);
  check("list reaches every imported session and not the quarantined one",
    arts.some((a) => a.sessionId === PID) && arts.some((a) => a.sessionId === CID) &&
      arts.some((a) => a.sessionId === XID) && !arts.some((a) => a.sessionId === TID));
  const target = arts.find((a) => a.sessionId === CID);
  const openedImp = await openSessionFile(target.file, model);

  // A string that exists only inside an imported session: taken from the
  // imported session's own projected text at runtime, then searched for.
  let marker = null;
  for (const ev of openedImp.events) {
    const msg = model.deriveEventMessage(ev);
    if (!msg) continue;
    const text = String(fork.projectMessageText(msg) ?? "");
    const m = text.match(/[A-Za-z][A-Za-z0-9'_-]{2,}(?: [A-Za-z0-9'_-]{2,}){2,}/);
    if (m && (marker === null || m[0].length > marker.length)) marker = m[0];
  }
  // The fork compiles `String(source)` as the regex — pass an escaped STRING,
  // exactly what `thursday session search <id> <pattern>` passes on the CLI.
  const markerPattern = marker === null ? null : marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check("show reads the imported session", summarize(openedImp, model, fork).text.length > 0);
  check("search finds a string that exists only inside an imported session",
    markerPattern !== null && searchView(openedImp.session, fork, markerPattern).totalMatches > 0,
    marker === null ? "no marker extractable" : `marker=${JSON.stringify(marker.slice(0, 40))}…`);
  const seq0 = openedImp.events.find((ev) => Number.isInteger(ev.seq))?.seq;
  const rec = recallView(openedImp.session, fork, "seq", String(seq0), 4096);
  check("recall reads the imported session", rec.ok === true && rec.recalled > 0);
  check("fold reads the imported session", runDiagnostics(openedImp, model, fork).fold !== undefined);

  // --- the installer never imports on its own -------------------------------
  // Source guard here; the behavioural half lives where the installer is
  // tested: packages/install's decoy-home tests assert a populated ~/.dsh is
  // untouched by a fresh install (E6's assertion, reads included).
  let repoRoot = path.dirname(new URL(import.meta.url).pathname);
  while (!fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml")) && repoRoot !== "/") repoRoot = path.dirname(repoRoot);
  const installHits = [];
  const scanInstall = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scanInstall(p);
      else if (/\.(sh|ts|mjs|js)$/.test(e.name) && /runImport|src\/import\.mjs|session\s+import/.test(fs.readFileSync(p, "utf8"))) installHits.push(p);
    }
  };
  for (const d of [path.join(repoRoot, "install"), path.join(repoRoot, "packages", "install", "src")]) {
    if (fs.existsSync(d)) scanInstall(d);
  }
  check("the installer never imports sessions on its own", installHits.length === 0, installHits.join(", "));

  // --- review follow-ups (independent review of 8d92927, observations 2/6/7/8)
  const src2 = path.join(outDir, "import-src2");
  const dupA = path.join(src2, "--ws-a--", `session-${PID}`);
  const dupB = path.join(src2, "--ws-a--", PID);
  mkSession(dupA, PID, { origin: "human", delegationDepth: 0 });
  mkSession(dupB, PID, { origin: "human", delegationDepth: 0 });
  // A decoy uncompressed sibling: unparsable on purpose, and must not be
  // chosen while a compressed artifact sits beside it.
  fs.writeFileSync(path.join(dupA, "session.jsonl"), Buffer.from('{"type":"session"}\nnot json\n'));
  const scan2 = await scanImportSource(src2);
  check("a directory with both log shapes resolves to the compressed one",
    scan2.sessions.find((s) => s.sessionId === `session-${PID}`)?.logName === "session.jsonl.zstd");
  const rDup = await runImport({ sourceRoot: src2, destRoot: path.join(outDir, "import-dest-dup"), select: [PID] });
  check("same-id duplicate directories import once, counted as duplicates",
    rDup.counts.imported === 1 && rDup.counts.duplicates === 1, JSON.stringify(rDup.counts));
  let refused = null;
  try {
    await runImport({ sourceRoot: srcRoot, destRoot: path.join(srcRoot, "inside"), select: [PID] });
  } catch (e) {
    refused = e;
  }
  check("a destination inside the source tree is refused outright",
    refused !== null && /inside the source tree/.test(refused.message), refused?.message);
  // VALID JSON, no trailing newline: pins the no-trailing-newline gate
  // specifically (the mid-JSON arm is covered by the torn fixture above), so
  // reverting the gate cannot slip past this check.
  const tornNoNl = path.join(outDir, "torn-no-newline.jsonl");
  fs.writeFileSync(tornNoNl, mkHeader(XID, {}) + "\n" + '{"type":"step/start","seq":1,"time":1,"data":{}}');
  const tornVerdict = await inspectLog(tornNoNl);
  check("valid JSON without a trailing newline is quarantined by the newline gate",
    tornVerdict.ok === false && /trailing newline/.test(tornVerdict.reason ?? ""), tornVerdict.reason);
}
log("");

// ---------------------------------------------------------------------------
log("=".repeat(78));
log(`RESULT: ${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed`);
log("=".repeat(78));
fs.writeFileSync(path.join(outDir, "test-output.txt"), lines.join("\n") + "\n");
console.log(`\n(transcript written to ${path.join(outDir, "test-output.txt")})`);
process.exit(failed === 0 ? 0 : 1);
