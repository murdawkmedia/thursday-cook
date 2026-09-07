/**
 * DIAGNOSE a session log: find where a projection went wrong, and say why.
 *
 * SAFETY PROPERTY 2 (non-negotiable): diagnosis never modifies a session.
 * Every check here consumes the in-memory value `read.mjs` produced from an
 * `r`-mode read. Nothing in this module opens a file for writing, and
 * `runDiagnostics` returns the artifact checksum it read so a caller can prove
 * the file was untouched. `thursday session diagnose --prove-readonly` does
 * exactly that: checksum, diagnose, checksum, compare.
 *
 * Every rule below is either dsh's own or the fork's own. This module contains
 * NO independent notion of what a correct session looks like — it runs the real
 * validators and reports what they say. The one exception is the seq-index
 * invariant, which is not a rule we invented either: it is a REQUIREMENT the
 * fork's own code imposes on any session-shaped value handed to it
 * (`recall.js:212-213`, `search.js:63-65`), so violating it silently breaks
 * recall and search.
 */

/** Severity ordering used for exit codes and sorting. */
export const SEVERITY = Object.freeze({ error: 3, warning: 2, info: 1 });

/** One diagnostic finding. */
export class Finding {
  /**
   * @param {'error'|'warning'|'info'} severity
   * @param {string} code stable, greppable
   * @param {string} title one line
   * @param {object} [detail] `{where, why, fix, evidence}`
   */
  constructor(severity, code, title, detail = {}) {
    this.severity = severity;
    this.code = code;
    this.title = title;
    Object.assign(this, detail);
  }
}

/**
 * CHECK 1 — the artifact container.
 *
 * A torn final zstd frame is the ordinary shape of a log whose process died
 * mid-append. It is a warning, not an error: the committed prefix before it is
 * entirely good, which is exactly why repair must never discard it.
 */
export function checkContainer(opened) {
  const out = [];
  const a = opened.artifact;
  if (a.tornStart !== null) {
    out.push(
      new Finding("warning", "torn-tail", "The log has a torn final frame.", {
        where: `byte ${a.tornStart} of ${a.bytes}`,
        why:
          `dsh writes one independent zstd frame per durable batch. An incomplete final frame means ` +
          `the process died between starting and finishing an append. The ${a.frames.length} complete ` +
          `frame(s) before byte ${a.tornStart} are intact and readable.`,
        fix: "`thursday session repair` writes a copy truncated to the committed prefix, with dsh's own synthetic turn closers appended.",
      }),
    );
  }
  for (const i of a.issues) {
    if (i.code === "zstd-torn-tail" || i.code === "zstd-no-progress" || i.code === "zstd-torn-record")
      continue; // already reported by the torn-tail finding above
    out.push(new Finding("warning", i.code, i.message, { where: `byte ${i.byteOffset ?? "?"}` }));
  }
  return out;
}

/**
 * CHECK 2 — the JSONL record layer.
 *
 * Unparsable lines and rows dsh's own `decodeStorageRecord` rejects. A rejected
 * packed chunk row is serious: one row can store hundreds of events, so
 * dropping it silently would lose a whole assistant response. dsh's decoder
 * fails loud by design, and we surface that rather than swallowing it.
 */
export function checkRecords(opened) {
  const out = [];
  for (const i of opened.issues) {
    switch (i.code) {
      case "unparsable-line":
        out.push(
          new Finding("error", "unparsable-line", "A log line is not valid JSON.", {
            where: `line ${i.line}`,
            why: "Every line after the header must be one JSON storage record. This one cannot be parsed, so whatever events it stored are lost from the in-memory log.",
            evidence: i.preview,
            fix: "`thursday session repair --drop-unparsable` writes a copy with the bad line removed and every other line byte-identical.",
          }),
        );
        break;
      case "undecodable-record":
        out.push(
          new Finding("error", "undecodable-record", "dsh's decodeStorageRecord rejected a storage row.", {
            where: `line ${i.line} (type ${i.type})`,
            why:
              "A packed `*-chunks` row can store a whole run of assistant deltas. dsh's decoder rejects a malformed one rather than silently dropping the run, so this is real data loss, not a cosmetic fault.",
            fix: "Recoverable only if the row's text is intact; inspect with `thursday session raw --line N`.",
          }),
        );
        break;
      case "missing-header":
        out.push(
          new Finding("error", "missing-header", "Line 1 is not a session header record.", {
            where: "line 1",
            why: "dsh writes the immutable SessionHeader as the first record, tagged `type: \"session\"`. Without it the log has no id, cwd or preset, and dsh's own `list` cannot see the session at all.",
          }),
        );
        break;
      case "no-trailing-newline":
        out.push(
          new Finding("warning", "no-trailing-newline", "The final record has no trailing newline.", {
            where: `line ${i.line}`,
            why: "dsh's reader treats a final record without a newline as a torn tail and ignores it. The event(s) on that line will not be seen by dsh.",
          }),
        );
        break;
      case "empty-line":
        out.push(new Finding("warning", "empty-line", "A blank line inside the log.", { where: `line ${i.line}` }));
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * CHECK 3 — the seq index invariant.
 *
 * The fork indexes by seq: `recall.js:212` does `session.events[seq]` and
 * `:213` rejects the slot unless `event.seq === seq`; `search.js:63-65`
 * iterates positions 0..length and skips any slot whose seq disagrees. So a
 * DUPLICATE seq makes the later event unreachable, and a GAP makes every seq
 * above it point at the wrong event or at nothing.
 *
 * This is the check that catches a hand-edited or half-merged log, and it is
 * the defect class the deliberately corrupted fixture in `tests/` exercises.
 */
export function checkSeqIndex(opened) {
  const out = [];
  for (const i of opened.issues) {
    if (i.code === "duplicate-seq") {
      out.push(
        new Finding("error", "duplicate-seq", `seq ${i.seq} appears more than once.`, {
          where: `line ${i.firstLine} and line ${i.line}`,
          why:
            "The compaction fork's recall and search index the log BY SEQ (recall.js:212-213, search.js:63-65). " +
            "With two events claiming one seq, the second is unreachable: `recall` will always return the first, " +
            "so a checkpoint pointer into the second silently resolves to the wrong content.",
          fix: "`thursday session repair --renumber` is NOT offered: renumbering would invalidate every existing checkpoint pointer. Use `--drop-line N` to remove the duplicate you judge redundant.",
        }),
      );
    }
    if (i.code === "bad-seq") {
      out.push(
        new Finding("error", "bad-seq", "An event has a non-integer seq.", {
          where: `line ${i.line} (type ${i.type})`,
          why: "Seq is the durable pointer every checkpoint and recall reference uses. A non-integer seq cannot be indexed at all.",
        }),
      );
    }
  }

  // Gaps: seq must be contiguous from the log's first seq.
  const present = [];
  const bySeq = opened.session.events;
  for (let s = 0; s < bySeq.length; s += 1) if (bySeq[s] !== undefined) present.push(s);
  if (present.length > 0) {
    const gaps = [];
    for (let k = 1; k < present.length; k += 1) {
      if (present[k] !== present[k - 1] + 1) gaps.push({ after: present[k - 1], before: present[k] });
    }
    if (present[0] !== 0) gaps.unshift({ after: -1, before: present[0] });
    if (gaps.length > 0) {
      out.push(
        new Finding("error", "seq-gap", `The seq sequence has ${gaps.length} gap(s).`, {
          where: gaps
            .slice(0, 6)
            .map((g) => (g.after < 0 ? `starts at ${g.before}, not 0` : `${g.after} -> ${g.before}`))
            .join(", ") + (gaps.length > 6 ? ` (+${gaps.length - 6} more)` : ""),
          why:
            "dsh appends events with contiguous seqs. A gap means events were removed from the file, or a line " +
            "failed to decode. Because the fork indexes by seq, every seq above the gap now sits at the wrong " +
            "array position for `search`, which iterates positions and skips mismatches — so search will silently " +
            "stop seeing events past the gap.",
          fix: "Nothing can invent the missing events. `thursday session repair --truncate-at N` writes a copy containing the contiguous good prefix only.",
        }),
      );
    }
  }
  return out;
}

/**
 * CHECK 4 — the surface projection, using dsh's own canonical fold.
 *
 * `foldSurface` (dsh-session `lib/types/surface.js`) is documented to throw
 * "when an event violates surface metadata, source-event references, range, or
 * tool-result rewrite rules". That throw IS the "the projection is inconsistent
 * with its log" detector. We do not re-derive those four rule families; we run
 * the real fold and report what it says.
 *
 * On success we also report what the projection FOLDED TO: how many nodes are
 * model-visible, and which ranges were shadowed by which replacement — the
 * "what did this projection fold to and why" view.
 */
export function checkSurface(opened, model) {
  const out = [];
  let fold;
  try {
    fold = model.foldSurface(opened.session.ordered);
  } catch (e) {
    out.push(
      new Finding("error", "surface-inconsistent", "dsh's own foldSurface rejected this log.", {
        why:
          "`foldSurface` is THE canonical surface projection in @deepseek-ai/dsh-session. It throws when an event " +
          "violates surface metadata, source-event references, replacement range, or tool-result rewrite rules. " +
          "Its message names the specific violation.",
        evidence: e.message,
        fix: "This is a projection defect, not a container defect. Locate the offending seq from the message, then `thursday session show --seq N`.",
      }),
    );
    return { findings: out, fold: undefined };
  }

  // Cross-check: every replacement's declared range vs what it actually shadowed.
  for (const r of fold.replacements) {
    const declared = r.end - r.start + 1;
    if (r.shadowedSeqs.length === 0) {
      out.push(
        new Finding("warning", "replacement-shadowed-nothing", `Replacement at seq ${r.seq} shadowed no surface entries.`, {
          where: `seq ${r.seq}, declared range ${r.start}..${r.end}`,
          why:
            "A compaction checkpoint that replaces nothing adds tokens without removing any — the pathology the " +
            "pinned fork exists to fix (see packages/blocks/compaction-instant.md, 'Why the fork'). It is not " +
            "corruption, but it is a projection that did not do its job.",
        }),
      );
    } else if (r.shadowedSeqs.length !== declared) {
      out.push(
        new Finding("info", "replacement-range-partial", `Replacement at seq ${r.seq} shadowed ${r.shadowedSeqs.length} of a declared ${declared}-seq range.`, {
          where: `seq ${r.seq}, declared ${r.start}..${r.end}`,
          why: "Normal when the declared range spans non-surface events (chunks, boundaries), which never held a surface slot. Reported for transparency, not as a fault.",
        }),
      );
    }
  }
  return { findings: out, fold };
}

/**
 * CHECK 5 — compaction transaction state, from the fork's own inspector.
 *
 * `inspectCompactionEntryState` (fork `src/region.js:519`) walks the events
 * backwards and reports an unmatched `compaction/start`, an open turn, and the
 * latest seed boundary. An unmatched `compaction/start` is a compaction that
 * began and never landed — a durable lock left held.
 */
export function checkCompaction(opened, fork) {
  const out = [];
  const st = fork.inspectCompactionEntryState(opened.session.ordered);
  if (st.unmatchedCompactionStart !== undefined) {
    out.push(
      new Finding("error", "compaction-unmatched-start", "A compaction started and never completed.", {
        where: `seq ${st.unmatchedCompactionStart.seq}`,
        why:
          "The fork records a compaction as a `compaction/start` … `compaction/end` pair. An unmatched start is a " +
          "durable compaction lock still held, which `assertNoActiveCompaction` (fork src/region.js:305) will " +
          "refuse to compact past. The session cannot compact again until it is closed.",
        fix: "`thursday session repair` appends the closers dsh's own repair rule produces; inspect the plan first with `--dry-run`.",
      }),
    );
  }
  if (st.openTurn !== null && st.openTurn !== undefined) {
    out.push(
      new Finding("warning", "open-turn", `Turn ${st.openTurn} was never closed.`, {
        why:
          "A `turn/start` with no matching `turn/end`. Normal for a session that is running right now; a durable " +
          "defect for one that is not, because resuming it yields a transcript with an unbalanced turn.",
        fix: "`thursday session repair` uses dsh's own `interruptedTurnClosers` to synthesise the missing tool results, `step/end` and interrupted `turn/end`.",
      }),
    );
  }
  return { findings: out, state: st };
}

/**
 * CHECK 6 — would dsh's own crash-repair rule want to change anything?
 *
 * `interruptedTurnClosers` (dsh-session `lib/types/repair.js`) returns the
 * deterministic synthetic events that close an open tail turn, and an empty
 * array when the log is already balanced. Calling it is PURE — it returns
 * events, it does not write them — so this is a legitimate read-only probe of
 * "is this log balanced according to dsh itself".
 */
export function checkBalance(opened, model) {
  const out = [];
  let closers;
  try {
    closers = model.interruptedTurnClosers(opened.session.ordered);
  } catch (e) {
    out.push(
      new Finding("error", "repair-rule-threw", "dsh's interruptedTurnClosers could not analyse this log.", {
        evidence: e.message,
        why: "The repair rule itself rejected the event list, which means the log is malformed below the level repair operates at.",
      }),
    );
    return { findings: out, closers: [] };
  }
  if (closers.length > 0) {
    const kinds = new Map();
    for (const c of closers) kinds.set(c.type, (kinds.get(c.type) ?? 0) + 1);
    out.push(
      new Finding("warning", "unbalanced-tail", `dsh's repair rule would append ${closers.length} closer event(s).`, {
        where: `seqs ${closers[0].seq}..${closers[closers.length - 1].seq}`,
        why:
          "`interruptedTurnClosers` is dsh's own crash-recovery rule. A non-empty result means the log's final turn " +
          `is unbalanced: ${[...kinds.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}. ` +
          "Codes it uses: TOOL_NOT_STARTED (an assistant tool request that never reached a recorded call start), " +
          "TOOL_OUTCOME_UNKNOWN (a recorded call whose outcome was never durably written).",
        fix: "`thursday session repair` appends exactly these events to a COPY. It does not invent any of them.",
      }),
    );
  }
  return { findings: out, closers };
}

/**
 * Run every check. Read-only.
 *
 * @param {object} opened result of `openSessionFile`
 * @param {object} model layer A
 * @param {object} fork layer B
 * @returns {{findings: Finding[], counts: object, worst: string, checksumAtRead: string, repairPlan: object}}
 */
export function runDiagnostics(opened, model, fork) {
  const findings = [];
  findings.push(...checkContainer(opened));
  findings.push(...checkRecords(opened));
  findings.push(...checkSeqIndex(opened));
  const surface = checkSurface(opened, model);
  findings.push(...surface.findings);
  const compaction = checkCompaction(opened, fork);
  findings.push(...compaction.findings);
  const balance = checkBalance(opened, model);
  findings.push(...balance.findings);

  findings.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const worst = counts.error > 0 ? "error" : counts.warning > 0 ? "warning" : counts.info > 0 ? "info" : "clean";

  return {
    findings,
    counts,
    worst,
    checksumAtRead: opened.artifact.checksum,
    fold: surface.fold,
    repairPlan: {
      closers: balance.closers,
      tornStart: opened.artifact.tornStart,
      unparsableLines: opened.issues.filter((i) => i.code === "unparsable-line").map((i) => i.line),
      duplicateSeqLines: opened.issues.filter((i) => i.code === "duplicate-seq").map((i) => i.line),
    },
  };
}

/** Render findings as readable text. Bounded by construction: one block each. */
export function renderDiagnostics(result, opts = {}) {
  const L = [];
  const mark = { error: "ERROR  ", warning: "WARN   ", info: "INFO   " };
  L.push(
    result.worst === "clean"
      ? "No structural defects found."
      : `${result.counts.error} error(s), ${result.counts.warning} warning(s), ${result.counts.info} info.`,
  );
  const limit = opts.max ?? 40;
  result.findings.slice(0, limit).forEach((f) => {
    L.push("");
    L.push(`${mark[f.severity]}${f.code}: ${f.title}`);
    if (f.where) L.push(`       at    ${f.where}`);
    if (f.why) L.push(`       why   ${f.why}`);
    if (f.evidence) L.push(`       saw   ${String(f.evidence).slice(0, 400)}`);
    if (f.fix) L.push(`       fix   ${f.fix}`);
  });
  if (result.findings.length > limit) L.push("", `[+${result.findings.length - limit} more finding(s)]`);
  return L.join("\n");
}
