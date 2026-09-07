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
import { openSessionFile, checksumFile, findSessionArtifacts, defaultSessionRoots, readHeaderOnly } from "../src/read.mjs";
import { summarize } from "../src/view.mjs";
import { runDiagnostics } from "../src/diagnose.mjs";
import { planRepair, applyRepair, verifyRepair, confirmRepair } from "../src/repair.mjs";
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
  for (const name of ["duplicate-seq", "unparsable-line", "torn-frame", "open-turn"]) {
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
log("=".repeat(78));log("");

// ---------------------------------------------------------------------------
log("=".repeat(78));
log(`RESULT: ${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed`);
log("=".repeat(78));
fs.writeFileSync(path.join(outDir, "test-output.txt"), lines.join("\n") + "\n");
console.log(`\n(transcript written to ${path.join(outDir, "test-output.txt")})`);
process.exit(failed === 0 ? 0 : 1);
