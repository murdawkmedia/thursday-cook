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
import { readArtifact } from "./read.mjs";

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
  const frames = [];
  for (let i = 0; i < lines.length; i += perFrame) {
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

  for (const op of plan.ops) {
    if (op.kind === "drop-lines") for (const n of op.lines) dropped.add(n);
    if (op.kind === "truncate") {
      for (let n = op.line + 1; n <= originalLineCount; n += 1) dropped.add(n);
    }
    // drop-torn-frame needs no line work: the torn frame decoded to no
    // complete record, so it contributed no line to `lines` in the first place.
  }
  lines = lines.filter((_, i) => !dropped.has(i + 1));

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
    droppedLines: [...dropped].sort((a, b) => a - b),
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
export async function verifyRepair(sourceFile, repairedFile, droppedLines) {
  const a = await readArtifact(sourceFile);
  const b = await readArtifact(repairedFile);
  const dropped = new Set(droppedLines);
  const originalLines = a.plaintext.split("\n").filter((l) => l.length > 0);
  const repairedLines = b.plaintext.split("\n").filter((l) => l.length > 0);

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

  return {
    originalRecords: originalLines.length,
    droppedRecords: dropped.size,
    expectedSurvivors: expectedSurvivors.length,
    repairedRecords: repairedLines.length,
    byteIdenticalSurvivors: identical,
    appendedRecords: extra > 0 ? extra : 0,
    allGoodDataSurvived: problems.length === 0 && identical === expectedSurvivors.length,
    problems: problems.slice(0, 20),
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
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const superseded = `${applied.source}.superseded-${stamp}`;
  // Rename, never unlink. The original's bytes remain on disk under a new name.
  fs.renameSync(applied.source, superseded);
  fs.copyFileSync(applied.destination, applied.source);
  return {
    promoted: true,
    originalPreservedAt: superseded,
    liveFile: applied.source,
    repairedCopyStillAt: applied.destination,
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
