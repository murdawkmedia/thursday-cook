/**
 * REPAIR a session carrying bad state.
 *
 * SAFETY PROPERTY 1 (non-negotiable): a repair writes a COPY and keeps the
 * original until the user confirms. This module structurally cannot violate
 * that, and the structure is the point:
 *
 *   - `planRepair()` is pure. It reads nothing and writes nothing; it turns a
 *     diagnosis into a list of described operations.
 *   - `applyRepair()` writes ONE new file, at a path that must not already
 *     exist, and NEVER opens the original for writing. There is no code path in
 *     this file that opens the source artifact in any mode but `r`.
 *   - `confirmRepair()` is the ONLY function that touches the original, it
 *     requires an explicit `confirm: true` from the caller, it re-verifies the
 *     original's checksum is unchanged since the repair was planned, and it
 *     MOVES the original to a `.superseded-<timestamp>` sibling rather than
 *     deleting it. Even confirmation does not destroy data.
 *
 * A bad repair of a corrupted log is how the remaining good data is lost, so
 * every operation below is subtractive or additive at record granularity, and
 * every record not named by an operation is copied through BYTE-IDENTICALLY.
 * `verifyRepair()` proves that by diffing the repaired record set against the
 * original minus only the removed lines.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { readArtifact, isLoneHeaderLine } from "./read.mjs";
import { loadSessionModel } from "./runtime.mjs";
import { proveDshCanOpen } from "./dshoracle.mjs";

/** One described repair operation. Pure data; describes, does not do. */
export class RepairOp {
  constructor(kind, description, detail = {}) {
    this.kind = kind;
    this.description = description;
    Object.assign(this, detail);
  }
}

/**
 * Turn a diagnosis into a repair plan. PURE — no filesystem access at all.
 *
 * The plan is deliberately conservative. Two things it will NOT do, with the
 * reasons, because a doctor that silently does them destroys data:
 *
 *   - It never RENUMBERS seqs. Seq is the durable pointer every compaction
 *     checkpoint marker and every `recall` reference uses. Renumbering to close
 *     a gap would silently repoint every existing checkpoint at the wrong
 *     content. A gap is reported and left alone.
 *   - It never INVENTS events. The only events it appends are the ones dsh's
 *     own `interruptedTurnClosers` produced, verbatim.
 *
 * @param {object} diagnosis result of `runDiagnostics`
 * @param {{dropUnparsable?: boolean, dropDuplicateSeq?: boolean, closeTurns?: boolean, truncateAtLine?: number}} [choices]
 */
export function planRepair(diagnosis, choices = {}) {
  const ops = [];
  const refused = [];

  if (diagnosis.repairPlan.tornStart !== null && diagnosis.repairPlan.tornStart !== undefined) {
    ops.push(
      new RepairOp(
        "drop-torn-frame",
        `Rewrite without the incomplete final zstd frame that begins at byte ${diagnosis.repairPlan.tornStart}.`,
        {
          byteOffset: diagnosis.repairPlan.tornStart,
          why: "The torn frame decoded to no complete record, so nothing is lost by omitting it. Every complete frame before it is re-encoded from its own decoded records.",
        },
      ),
    );
  }

  if (choices.dropUnparsable && diagnosis.repairPlan.unparsableLines.length > 0) {
    ops.push(
      new RepairOp(
        "drop-lines",
        `Remove ${diagnosis.repairPlan.unparsableLines.length} unparsable line(s): ${diagnosis.repairPlan.unparsableLines.join(", ")}.`,
        {
          lines: diagnosis.repairPlan.unparsableLines,
          defect: "unparsable",
          why: "A line that will not JSON-parse stores no recoverable events. Every other line is copied through byte-identically.",
          cost: "The events that line stored are gone. They were already unreadable; this only makes the log parse cleanly.",
        },
      ),
    );
  } else if (diagnosis.repairPlan.unparsableLines.length > 0) {
    refused.push(
      `${diagnosis.repairPlan.unparsableLines.length} unparsable line(s) left in place — pass --drop-unparsable to remove them.`,
    );
  }

  if (choices.dropDuplicateSeq && diagnosis.repairPlan.duplicateSeqLines.length > 0) {
    ops.push(
      new RepairOp(
        "drop-lines",
        `Remove ${diagnosis.repairPlan.duplicateSeqLines.length} duplicate-seq line(s): ${diagnosis.repairPlan.duplicateSeqLines.join(", ")}.`,
        {
          lines: diagnosis.repairPlan.duplicateSeqLines,
          defect: "duplicate-seq",
          why: "The FIRST record for a seq is kept; only later records claiming an already-used seq are removed. The fork's recall already returns the first, so removing the later copy changes nothing that was reachable.",
          cost: "If the later copy was the correct one, this keeps the wrong one. Inspect both with `thursday session raw --line N` before choosing.",
        },
      ),
    );
  } else if (diagnosis.repairPlan.duplicateSeqLines.length > 0) {
    refused.push(
      `${diagnosis.repairPlan.duplicateSeqLines.length} duplicate-seq line(s) left in place — pass --drop-duplicate-seq to remove them.`,
    );
  }

  if (choices.closeTurns && diagnosis.repairPlan.closers.length > 0) {
    ops.push(
      new RepairOp(
        "append-closers",
        `Append ${diagnosis.repairPlan.closers.length} synthetic closer event(s) produced by dsh's own interruptedTurnClosers.`,
        {
          events: diagnosis.repairPlan.closers,
          seqs: diagnosis.repairPlan.closers.map((c) => c.seq),
          why: "These events are not invented by this tool. `interruptedTurnClosers` (@deepseek-ai/dsh-session lib/types/repair.js) is dsh's own crash-recovery rule: error results for unmatched calls, then step/end, then an interrupted turn/end, with seqs continuing the log.",
        },
      ),
    );
  } else if (diagnosis.repairPlan.closers.length > 0) {
    refused.push(
      `${diagnosis.repairPlan.closers.length} unbalanced-tail closer(s) not appended — pass --close-turns to append them.`,
    );
  }

  if (typeof choices.truncateAtLine === "number") {
    ops.push(
      new RepairOp("truncate", `Keep only records up to and including line ${choices.truncateAtLine}.`, {
        line: choices.truncateAtLine,
        why: "Explicitly requested. Everything after that line is dropped.",
        cost: "Irreversibly drops every later record FROM THE COPY. The original still has them.",
      }),
    );
  }

  // A seq gap can never be repaired; say so rather than pretending.
  const gap = diagnosis.findings.find((f) => f.code === "seq-gap");
  if (gap) {
    refused.push(
      "seq-gap CANNOT be repaired: the missing events do not exist anywhere. Renumbering to close the gap would repoint every existing checkpoint marker at the wrong content, so this tool refuses to do it.",
    );
  }

  return { ops, refused, willChangeAnything: ops.length > 0 };
}

/** Encode records back into a concatenated-zstd-frame container, dsh's layout. */
function encodeContainer(lines, compression, perFrame = 64) {
  const text = lines.map((l) => l + "\n").join("");
  if (compression === "none") return Buffer.from(text, "utf8");
  if (lines.length === 0) return Buffer.alloc(0);
  
  // D1 FIX: dsh's loader asserts the first zstd frame is the header line ALONE.
  // @deepseek-ai/dsh-session-persistence-jsonl lib/index.js:741-743:
  //   if (plaintext.length === 0 || plaintext.indexOf(10) !== plaintext.length - 1)
  //     throw new Error("corrupt Zstandard session log: first frame is not exactly one header line");
  // Violation causes: readFirstZstdLine crash (the incident), readPrefix rejection, listArtifacts dies.
  const frames = [];
  frames.push(zlib.zstdCompressSync(Buffer.from(lines[0] + "\n", "utf8")));
  // All remaining records packed in 64-line frames.
  for (let i = 1; i < lines.length; i += perFrame) {
    const chunk = lines.slice(i, i + perFrame).map((l) => l + "\n").join("");
    frames.push(zlib.zstdCompressSync(Buffer.from(chunk, "utf8")));
  }
  return Buffer.concat(frames);
}

/**
 * Apply a repair plan BY WRITING A NEW FILE.
 *
 * Refuses to overwrite: if `destination` exists, it throws. Refuses to write to
 * the source path at all. The original is never opened for writing here.
 *
 * @param {string} sourceFile the original artifact (read-only)
 * @param {object} plan result of `planRepair`
 * @param {string} destination new file path; must not exist
 * @param {{compression?: 'zstd'|'none'}} [opts]
 */
export async function applyRepair(sourceFile, plan, destination, opts = {}) {
  const src = path.resolve(sourceFile);
  const dst = path.resolve(destination);
  if (src === dst) {
    throw new Error(
      `refusing to repair in place: destination is the source (${dst}). A repair always writes a copy.`,
    );
  }
  if (fs.existsSync(dst)) {
    throw new Error(`refusing to overwrite an existing file: ${dst}`);
  }

  // Read the original. `readArtifact` opens `r` only.
  const before = await readArtifact(src);
  const originalChecksum = before.checksum;

  // Work at RECORD granularity on the exact decoded text. Any line not named
  // by an operation is carried through byte-identically.
  let lines = before.plaintext.split("\n").filter((l) => l.length > 0);
  const originalLineCount = lines.length;
  const dropped = new Set();
  const substituted = new Set();

  for (const op of plan.ops) {
    if (op.kind === "drop-lines") {
      // An unparsable record is REPLACED, not removed. dsh's scanner requires
      // every event's seq to equal the number of events read before it
      // (dsh-session-persistence-jsonl lib/index.js:290), so seqs must be dense
      // AND in file order. Removing one record shifts every later seq by one and
      // dsh refuses the whole log -- which is how --drop-unparsable turned a file
      // with one bad line into a file that would not open at all.
      //
      // A duplicate seq is the opposite case: the sequence is dense only once the
      // later copy is gone, so those really are dropped.
      const target = op.defect === "unparsable" ? substituted : dropped;
      for (const n of op.lines) target.add(n);
    }
    if (op.kind === "truncate") {
      for (let n = op.line + 1; n <= originalLineCount; n += 1) dropped.add(n);
    }
    // drop-torn-frame needs no line work: the torn frame decoded to no
    // complete record, so it contributed no line to `lines` in the first place.
  }

  // Mark first, filter second, then number: a substitute's seq is its position in
  // the FINAL event order, so it must be assigned after any drops have shifted it.
  const SUBSTITUTE = Symbol("substitute");
  lines = lines
    .map((l, i) => (substituted.has(i + 1) ? SUBSTITUTE : l))
    .filter((_, i) => !dropped.has(i + 1));

  if (lines.includes(SUBSTITUTE)) {
    // A substitute's seq is the number of EVENTS decoded before it, which is not
    // its line index: one storage line can expand to many events, because dsh
    // packs text-chunks, reasoning-chunks and tool-call-chunks rows. Count with
    // dsh's own decodeStorageRecord rather than assuming one line is one event.
    const model = await loadSessionModel();
    let nextSeq = 0;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i] === SUBSTITUTE) {
        lines[i] = JSON.stringify({
          // An unrecognised type projects to no message: deriveEventMessage's
          // default arm returns null and its comment calls the union
          // "merge-extensible", and decodeStorageRecord passes through anything
          // that is not one of the three chunk-row types. So this record holds
          // the seq without entering the transcript.
          type: "session/repair-substitute",
          seq: nextSeq,
          time: Date.now(),
          data: { reason: "unparsable record replaced to preserve seq continuity" },
        });
        nextSeq += 1;
        continue;
      }
      try {
        nextSeq += model.decodeStorageRecord(JSON.parse(lines[i])).length;
      } catch {
        // Cannot happen: every remaining line parsed during diagnosis. If it ever
        // does, advancing by one keeps the count monotonic and the dsh oracle
        // will reject the result rather than this silently producing a bad file.
        nextSeq += 1;
      }
    }
  }

  const appended = [];
  for (const op of plan.ops) {
    if (op.kind === "append-closers") {
      for (const ev of op.events) {
        const line = JSON.stringify(ev);
        lines.push(line);
        appended.push(line);
      }
    }
  }

  const compression = opts.compression ?? (src.endsWith(".jsonl.zstd") ? "zstd" : "none");
  const bytes = encodeContainer(lines, compression);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // wx: fail if it appeared between the check and now.
  fs.writeFileSync(dst, bytes, { flag: "wx" });

  // Re-read the original to prove reading + repairing did not disturb it.
  const afterChecksum = createHash("sha256").update(fs.readFileSync(src)).digest("hex");

  return {
    source: src,
    destination: dst,
    originalChecksum,
    originalChecksumAfterRepair: afterChecksum,
    originalUntouched: originalChecksum === afterChecksum,
    originalLineCount,
    droppedLines: [...dropped, ...substituted].sort((a, b) => a - b),
    substitutedLines: [...substituted].sort((a, b) => a - b),
    appendedCount: appended.length,
    repairedLineCount: lines.length,
    compression,
    bytes: bytes.length,
  };
}

/**
 * PROVE the repair kept every good record.
 *
 * Diffs the repaired record set against the original MINUS ONLY the lines the
 * plan named. Any survivor that differs by even one byte, and any survivor that
 * vanished, is reported. This is deliverable 8's "prove the events that were
 * still good survived".
 *
 * @param {string} sourceFile original
 * @param {string} repairedFile the copy
 * @param {number[]} droppedLines 1-based line numbers the plan removed
 */
export async function verifyRepair(sourceFile, repairedFile, droppedLines, opts = {}) {
  const a = await readArtifact(sourceFile);
  const b = await readArtifact(repairedFile);
  const dropped = new Set(droppedLines);
  const originalLines = a.plaintext.split("\n").filter((l) => l.length > 0);
  // A substitute stands in for a record that decoded to nothing, so it is neither
  // a survivor nor a drop. Set it aside before the positional comparison, or every
  // record after it reads as differing when nothing about it changed.
  const substitutes = [];
  const repairedLines = b.plaintext
    .split("\n")
    .filter((l) => l.length > 0)
    .filter((l) => {
      let parsed;
      try {
        parsed = JSON.parse(l);
      } catch {
        return true;
      }
      if (parsed && parsed.type === "session/repair-substitute") {
        substitutes.push(l);
        return false;
      }
      return true;
    });

  const expectedSurvivors = originalLines.filter((_, i) => !dropped.has(i + 1));
  const problems = [];
  let identical = 0;

  for (let i = 0; i < expectedSurvivors.length; i += 1) {
    if (repairedLines[i] === undefined) {
      problems.push(`survivor ${i + 1} is missing from the repaired log`);
      continue;
    }
    if (repairedLines[i] !== expectedSurvivors[i]) {
      problems.push(
        `survivor ${i + 1} differs: original ${JSON.stringify(expectedSurvivors[i].slice(0, 90))} vs repaired ${JSON.stringify(repairedLines[i].slice(0, 90))}`,
      );
      continue;
    }
    identical += 1;
  }
  const extra = repairedLines.length - expectedSurvivors.length;

  // D2(b): verify physical framing of the repaired container.
  // D2(c): proof from dsh's own loader, not our reader.
  const framingProblems = [];
  let dshOpen = { ok: false, problems: ["dsh oracle not run"] };
  let firstFrameOk = true;
  if (b.compression === "zstd") {
    if (b.frames.length === 0) {
      framingProblems.push("no complete zstd frames in the repaired file");
      firstFrameOk = false;
    } else {
      // Frame 0 must be the header line alone (dsh's assertZstdHeaderFrame).
      if (!isLoneHeaderLine(b.frames[0]?.firstFramePlaintext ?? Buffer.alloc(0))) {
        framingProblems.push(
          `frame 0 holds ${b.frames[0].lineCount} line(s); dsh requires the header line ALONE`
        );
        firstFrameOk = false;
      }
      // Every complete frame must end at a record boundary (newline).
      for (let i = 0; i < b.frames.length; i++) {
        if (!b.frames[i].endsWithNewline) {
          framingProblems.push(`frame ${i} ends mid-record (no trailing newline)`);
        }
      }
    }
  }

  // D2(c): the authoritative proof is dsh's own loader, not this package's reader.
  try {
    dshOpen = await proveDshCanOpen(repairedFile);
  } catch (e) {
    dshOpen = {
      ok: false,
      problems: [`dsh oracle threw: ${e.message}`],
    };
  }

  const allProblems = [...problems, ...framingProblems, ...dshOpen.problems.map((p) => `dsh: ${p}`)];

  return {
    originalRecords: originalLines.length,
    droppedRecords: dropped.size,
    substitutedRecords: substitutes.length,
    expectedSurvivors: expectedSurvivors.length,
    repairedRecords: repairedLines.length,
    byteIdenticalSurvivors: identical,
    appendedRecords: extra > 0 ? extra : 0,
    allGoodDataSurvived: problems.length === 0 && identical === expectedSurvivors.length,
    framingOk: framingProblems.length === 0,
    dshCanOpen: dshOpen.ok,
    ok: problems.length === 0 && framingProblems.length === 0 && dshOpen.ok,
    problems: allProblems.slice(0, 20),
  };
}

/**
 * The ONLY function that touches the original — and it still does not delete it.
 *
 * Requires an explicit `confirm === true`. Re-checks the original's checksum
 * against the one recorded when the repair was written, so a repair planned
 * against a file that has since changed is refused rather than applied blind.
 * The original is RENAMED to a `.superseded-<iso>` sibling; the repaired copy
 * takes its place. Reversing the whole thing is one `mv`.
 *
 * @param {{source: string, destination: string, originalChecksum: string}} applied result of `applyRepair`
 * @param {{confirm: boolean}} opts
 */
export function confirmRepair(applied, opts) {
  if (opts?.confirm !== true) {
    return {
      promoted: false,
      reason:
        "not confirmed. The repaired copy is at " +
        applied.destination +
        " and the original is untouched. Re-run with explicit confirmation to promote it.",
    };
  }
  const current = createHash("sha256").update(fs.readFileSync(applied.source)).digest("hex");
  if (current !== applied.originalChecksum) {
    throw new Error(
      `refusing to promote: the original changed since the repair was written ` +
        `(planned against ${applied.originalChecksum.slice(0, 12)}…, now ${current.slice(0, 12)}…). ` +
        `Re-run the repair against the current file.`,
    );
  }
  if (!fs.existsSync(applied.destination)) {
    throw new Error(`refusing to promote: the repaired copy ${applied.destination} no longer exists.`);
  }

  // D3 FIX: atomic promotion via rename, not copy. A crash between a non-atomic
  // copy leaves the live path missing or truncated. Rename is atomic on same FS.
  // Detect cross-filesystem attempts and refuse them loudly.
  const { dev: srcDev } = fs.statSync(applied.source);
  const { dev: dstDev } = fs.statSync(applied.destination);
  if (srcDev !== dstDev) {
    throw new Error(
      `refusing to promote: the repaired copy is on a different filesystem. ` +
      `Move it to ${path.dirname(applied.source)} or promote manually with: ` +
      `mv ${JSON.stringify(applied.destination)} ${JSON.stringify(applied.source)}`,
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const superseded = `${applied.source}.superseded-${stamp}`;
  
  // Atomic: rename original to backup, then move repaired into its place.
  // Both renames must succeed; if the second fails, the original is at superseded.
  fs.renameSync(applied.source, superseded);
  try {
    fs.renameSync(applied.destination, applied.source);
  } catch (e) {
    // Attempt recovery by restoring the original.
    try {
      fs.renameSync(superseded, applied.source);
      throw new Error(
        `promotion failed during rename: ${e.message}. ` +
        `The original has been restored. Please try again.`,
      );
    } catch (restoreErr) {
      // Restore failed; user must manually recover.
      throw new Error(
        `CRITICAL: promotion failed AND recovery failed. ` +
        `The original is at ${superseded}; the repaired copy is at ${applied.destination}. ` +
        `Manually restore the original with: mv ${JSON.stringify(superseded)} ${JSON.stringify(applied.source)}. ` +
        `Promotion error: ${e.message}. Restore error: ${restoreErr.message}`,
      );
    }
  }

  return {
    promoted: true,
    originalPreservedAt: superseded,
    liveFile: applied.source,
    undo: `mv ${JSON.stringify(superseded)} ${JSON.stringify(applied.source)}`,
  };
}

/** Render a repair plan for a human to approve. */
export function renderPlan(plan) {
  const L = [];
  if (!plan.willChangeAnything) L.push("No repair operations selected — nothing would be written.");
  else L.push(`Repair plan: ${plan.ops.length} operation(s). Nothing is written until you run without --dry-run.`);
  plan.ops.forEach((op, i) => {
    L.push("");
    L.push(`  ${i + 1}. [${op.kind}] ${op.description}`);
    if (op.why) L.push(`     why   ${op.why}`);
    if (op.cost) L.push(`     cost  ${op.cost}`);
  });
  if (plan.refused.length > 0) {
    L.push("");
    L.push("NOT DOING:");
    for (const r of plan.refused) L.push(`  - ${r}`);
  }
  return L.join("\n");
}
