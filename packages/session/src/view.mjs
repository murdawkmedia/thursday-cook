/**
 * FRIENDLY, BOUNDED-SIZE views of a session.
 *
 * The failure this file exists to prevent: an agent debugging a session pastes
 * a raw event dump into its own context and has no context left to debug with.
 * A real session here measured 198 527 events / 9.7 MB. So every view in this
 * module is a FOLD with a hard cap, never a dump.
 *
 * THE BOUND, stated exactly (deliverable 2):
 *
 *   - `maxTokens` — default 2000 density-aware tokens. "Density-aware" is the
 *     compaction fork's own token model (`countTokens` / `estimateEntryTokens`
 *     in its `src/compiler.js`), which is CJK-aware, so the cap means the same
 *     thing here as it does to the compaction engine that will later have to
 *     fit this text in a window.
 *   - `maxLines` — default 160 lines.
 *   - `maxTurns` — default 12 turn digests, taken head-and-tail with an
 *     explicit elision marker in the middle.
 *
 * HOW IT IS ENFORCED — three independent stages, so no single bug can breach it:
 *
 *   1. Structural: the turn list is sliced to `maxTurns` BEFORE any text is
 *      built, so cost is O(cap), not O(session). Per-item strings are cut with
 *      the fork's `truncateTokens` at build time.
 *   2. Total tokens: the fully assembled text is passed through the fork's
 *      `truncateTokens(text, maxTokens, ...)` one final time. This is the same
 *      function `recallSession` and `searchSession` use to honour their own
 *      budgets, so the cap cannot be breached by a section misbehaving.
 *   3. Total lines: the result is then clamped to `maxLines`, appending a
 *      marker naming how many lines were dropped.
 *
 * `summarize()` returns the measured `tokens` and `lines` alongside the text
 * and a `withinBound` boolean, so a caller (or a test) can assert the bound
 * rather than trust it.
 */

/** Defaults for the bounded summary. */
export const VIEW_DEFAULTS = Object.freeze({
  maxTokens: 2000,
  maxLines: 160,
  maxTurns: 12,
  /** Per-item text cut, in tokens: a prompt/answer excerpt inside a turn digest. */
  maxItemTokens: 80,
});

/** Human-readable byte size. */
function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

/** Human-readable duration. */
function humanMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** First non-empty line of a projected text, collapsed to one line. */
function firstLine(text) {
  for (const raw of String(text ?? "").split("\n")) {
    const t = raw.trim();
    if (t.length > 0) return t.replace(/\s+/gu, " ");
  }
  return "";
}

/**
 * Fold the ordered event list into per-turn digests.
 *
 * A turn digest is: which turn, how long, what the user asked (one line), which
 * tools ran and how often, what the assistant said last (one line), and how it
 * ended. That is the shape an agent actually needs to answer "what happened
 * here" — and it is bounded by construction because the per-turn tool tally is
 * a histogram, not a list.
 *
 * @param {Array} ordered dense event list in log order
 * @param {{deriveEventMessage: Function}} model layer A
 * @param {{projectMessageText: Function}} fork layer B
 */
export function foldTurns(ordered, model, fork) {
  /** @type {Map<number, any>} */
  const turns = new Map();
  const preamble = { turn: null, userPrompts: [], tools: new Map(), events: 0 };
  let current = preamble;

  const turnOf = (ev) => {
    const t = ev?.data?.turn;
    return Number.isInteger(t) ? t : undefined;
  };

  for (const ev of ordered) {
    const t = turnOf(ev);
    if (ev.type === "turn/start" && t !== undefined) {
      current = {
        turn: t,
        startSeq: ev.seq,
        startTime: ev.time,
        endSeq: undefined,
        endTime: undefined,
        reason: undefined,
        userPrompts: [],
        assistantLast: undefined,
        tools: new Map(),
        toolErrors: 0,
        steps: 0,
        events: 0,
      };
      turns.set(t, current);
      continue;
    }
    if (t !== undefined && turns.has(t)) current = turns.get(t);
    current.events += 1;

    switch (ev.type) {
      case "turn/end": {
        current.endSeq = ev.seq;
        current.endTime = ev.time;
        current.reason = ev.data?.reason?.kind ?? "?";
        break;
      }
      case "step/start":
        current.steps = (current.steps ?? 0) + 1;
        break;
      case "user/message": {
        const msg = model.deriveEventMessage(ev);
        if (msg) {
          current.userPrompts.push({
            seq: ev.seq,
            source: ev.data?.source?.kind ?? "user",
            text: fork.projectMessageText(msg),
          });
        }
        break;
      }
      case "assistant/message": {
        const msg = model.deriveEventMessage(ev);
        if (msg) current.assistantLast = { seq: ev.seq, text: fork.projectMessageText(msg) };
        break;
      }
      case "tool/call": {
        const name = ev.data?.name ?? "?";
        current.tools.set(name, (current.tools.get(name) ?? 0) + 1);
        break;
      }
      case "tool/result": {
        // A tool result whose meta marks an error; shape varies, so be lenient.
        const meta = ev.data?.meta;
        if (meta?.isError === true || meta?.outcome === "error") current.toolErrors += 1;
        break;
      }
      default:
        break;
    }
  }
  const list = [...turns.values()].sort((a, b) => a.turn - b.turn);
  return { turns: list, preamble };
}

/**
 * Compaction facts, entirely from the fork's own functions.
 *
 * `findCheckpointSeqs` (fork `src/recall.js:124`) finds landed checkpoint nodes;
 * `inspectCompactionEntryState` (fork `src/region.js:519`) reports an open turn,
 * an UNMATCHED `compaction/start` (a compaction that began and never closed —
 * a genuine "the projection went wrong" signal), and the latest seed boundary.
 */
export function compactionFacts(sessionShaped, ordered, fork) {
  const checkpoints = fork.findCheckpointSeqs(sessionShaped);
  const entryState = fork.inspectCompactionEntryState(ordered);
  return {
    checkpoints,
    openTurn: entryState.openTurn,
    unmatchedCompactionStartSeq: entryState.unmatchedCompactionStart?.seq,
    latestEndSeedSeq: entryState.latestEndSeedSeq,
  };
}

/**
 * Surface facts from dsh's own canonical fold.
 *
 * `foldSurface` THROWS when an event violates surface metadata, source-event
 * references, range, or tool-result rewrite rules. That throw is not a bug to
 * be swallowed — it IS the "this projection is inconsistent with its log"
 * detector, so it is caught and reported as a finding.
 */
export function surfaceFacts(ordered, model) {
  try {
    const fold = model.foldSurface(ordered);
    return {
      ok: true,
      nodes: fold.nodes.length,
      replacements: fold.replacements.length,
      replacementDetail: fold.replacements.slice(0, 5).map((r) => ({
        seq: r.seq,
        start: r.start,
        end: r.end,
        shadowed: r.shadowedSeqs.length,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Clamp text to a line count, appending an honest marker.
 * @returns {{text: string, lines: number, clamped: boolean}}
 */
function clampLines(text, maxLines) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, lines: lines.length, clamped: false };
  // The elision marker costs a line of its own, so there must be room for it.
  // At maxLines <= 1 there is not: emit content only, or the clamp would return
  // 2 lines for a 1-line bound.
  if (maxLines <= 1) {
    const only = lines.slice(0, Math.max(0, maxLines));
    return { text: only.join("\n"), lines: only.length, clamped: true };
  }
  const kept = lines.slice(0, maxLines - 1);
  kept.push(`[+${lines.length - kept.length} more line(s) cut by the ${maxLines}-line view bound]`);
  return { text: kept.join("\n"), lines: kept.length, clamped: true };
}

/**
 * Build the bounded, readable summary of one opened session.
 *
 * @param {object} opened result of `openSessionFile`
 * @param {object} model layer A
 * @param {object} fork layer B
 * @param {Partial<typeof VIEW_DEFAULTS>} [options]
 * @returns {{text: string, tokens: number, lines: number, withinBound: boolean, bound: object, truncated: boolean, facts: object}}
 */
export function summarize(opened, model, fork, options = {}) {
  const bound = { ...VIEW_DEFAULTS, ...options };
  const { header, artifact, events, session } = opened;

  const { turns } = foldTurns(session.ordered, model, fork);
  const compaction = compactionFacts(session, session.ordered, fork);
  const surface = surfaceFacts(session.ordered, model);

  const cut = (text, tokens = bound.maxItemTokens) =>
    fork.truncateTokens(firstLine(text), tokens, "session view bound").text;

  const typeCounts = new Map();
  for (const e of events) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  const topTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

  const L = [];
  L.push(`# session ${header?.id ?? "(no header)"}`);
  L.push("");
  L.push(
    `cwd            ${header?.cwd ?? "?"}` +
      (header?.agentPreset ? `\npreset         ${header.agentPreset}` : ""),
  );
  if (header?.parentSession)
    L.push(`parent         ${header.parentSession} (depth ${header.delegationDepth ?? "?"}, origin ${header.origin ?? "?"})`);
  if (header?.createdAt) L.push(`created        ${new Date(header.createdAt).toISOString()}`);
  const lastTime = session.ordered.length > 0 ? session.ordered[session.ordered.length - 1].time : undefined;
  if (header?.createdAt && lastTime)
    L.push(`span           ${humanMs(lastTime - header.createdAt)}`);
  L.push(
    `artifact       ${humanBytes(artifact.bytes)} ${artifact.compression}` +
      (artifact.compression === "zstd" ? `, ${artifact.frames.length} frame(s)` : "") +
      `, ${events.length} event(s)`,
  );
  L.push(`event types    ${topTypes}`);
  L.push(
    `surface        ` +
      (surface.ok
        ? `${surface.nodes} node(s), ${surface.replacements} replacement(s)`
        : `INCONSISTENT — dsh foldSurface rejected this log: ${cut(surface.error, 60)}`),
  );
  L.push(
    `compaction     ${compaction.checkpoints.length} checkpoint(s)` +
      (compaction.unmatchedCompactionStartSeq !== undefined
        ? `, UNMATCHED compaction/start at seq ${compaction.unmatchedCompactionStartSeq}`
        : "") +
      (compaction.openTurn !== null && compaction.openTurn !== undefined
        ? `, turn ${compaction.openTurn} left OPEN`
        : ""),
  );
  if (opened.issues.length > 0) {
    const byCode = new Map();
    for (const i of opened.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
    L.push(
      `read issues    ${[...byCode.entries()].map(([k, v]) => `${k}×${v}`).join(" ")}  ` +
        `(run \`thursday session diagnose\` for detail)`,
    );
  }
  L.push("");
  L.push(`## turns (${turns.length})`);

  // Structural bound stage 1: head-and-tail slice before building any text.
  let shown = turns;
  let elidedAt = -1;
  if (turns.length > bound.maxTurns) {
    const head = Math.ceil(bound.maxTurns / 2);
    const tail = bound.maxTurns - head;
    shown = [...turns.slice(0, head), ...turns.slice(turns.length - tail)];
    elidedAt = head;
  }

  shown.forEach((t, i) => {
    if (i === elidedAt) {
      L.push("");
      L.push(`  … ${turns.length - shown.length} turn(s) elided by the ${bound.maxTurns}-turn view bound …`);
    }
    const dur = t.endTime && t.startTime ? humanMs(t.endTime - t.startTime) : "open";
    const tools =
      t.tools.size === 0
        ? "no tools"
        : [...t.tools.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([n, c]) => (c > 1 ? `${n}×${c}` : n))
            .join(" ");
    L.push("");
    L.push(
      `- turn ${t.turn}  seq ${t.startSeq}..${t.endSeq ?? "?"}  ${dur}  ${t.steps ?? 0} step(s)  ` +
        `${t.reason ?? "OPEN"}${t.toolErrors ? `  ${t.toolErrors} tool error(s)` : ""}`,
    );
    const prompt = t.userPrompts[0];
    if (prompt) L.push(`    ask   (${prompt.source} seq ${prompt.seq}) ${cut(prompt.text)}`);
    if (t.userPrompts.length > 1)
      L.push(`          +${t.userPrompts.length - 1} more user/message event(s) in this turn`);
    L.push(`    tools ${cut(tools, 60)}`);
    if (t.assistantLast) L.push(`    said  (seq ${t.assistantLast.seq}) ${cut(t.assistantLast.text)}`);
  });

  L.push("");
  L.push(
    `[bounded view: ≤${bound.maxTokens} tokens, ≤${bound.maxLines} lines, ≤${bound.maxTurns} turns. ` +
      `Use \`thursday session show --seq N\` or \`--search PATTERN\` to pull exact original content — ` +
      `the log is append-only, so nothing shown here is lossy in the file.]`,
  );

  const assembled = L.join("\n");

  // Bound stage 2: total token cap, enforced by the fork's own cutter.
  let budget = bound.maxTokens;
  let capped = fork.truncateTokens(assembled, budget, "session view bound");
  // Bound stage 3: total line cap.
  let clamped = clampLines(capped.text, bound.maxLines);
  let tokens = fork.estimateEntryTokens(clamped.text);
  let truncated = capped.truncated || clamped.clamped;

  // Stages 2 and 3 are not independent: `truncateTokens` appends a provenance
  // marker and `clampLines` appends an elision marker, so a cut made for one
  // bound can push the text back over the other. Measured: a 200-token request
  // came back at 210. Converge instead of assuming — shrink the token budget by
  // the observed overshoot and redo both stages until it fits.
  for (let guard = 0; tokens > bound.maxTokens && guard < 8; guard += 1) {
    budget = Math.max(16, budget - Math.max(8, tokens - bound.maxTokens));
    capped = fork.truncateTokens(assembled, budget, "session view bound");
    clamped = clampLines(capped.text, bound.maxLines);
    tokens = fork.estimateEntryTokens(clamped.text);
    truncated = true;
  }
  // Hard backstop: whatever the markers do, drop trailing lines until the cap
  // holds. The bound is a promise to the caller's context window, so it is
  // never allowed to be "close enough".
  if (tokens > bound.maxTokens) {
    let kept = clamped.text.split("\n");
    while (kept.length > 1 && fork.estimateEntryTokens(kept.join("\n")) > bound.maxTokens) kept.pop();
    let text = kept.join("\n");
    // Even one line can exceed a very small cap (the title line alone is ~26
    // tokens). Binary-search the longest prefix that fits, so the bound holds
    // for ANY cap rather than only for reasonable ones.
    if (fork.estimateEntryTokens(text) > bound.maxTokens) {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fork.estimateEntryTokens(text.slice(0, mid)) <= bound.maxTokens) lo = mid;
        else hi = mid - 1;
      }
      text = text.slice(0, lo);
    }
    clamped = { text, lines: text.length === 0 ? 0 : text.split("\n").length, clamped: true };
    tokens = fork.estimateEntryTokens(clamped.text);
    truncated = true;
  }

  return {
    text: clamped.text,
    tokens,
    lines: clamped.lines,
    truncated,
    withinBound: tokens <= bound.maxTokens && clamped.lines <= bound.maxLines,
    bound,
    facts: { turns: turns.length, compaction, surface, issues: opened.issues.length },
  };
}

/**
 * Pull exact original content for chosen seqs — the escape hatch from the
 * bounded summary into the full truth, using the fork's own recall path so the
 * budget semantics are identical to the `recall` tool an agent already knows.
 *
 * `resolveRecallReference` accepts `seq` / `result` / `checkpoint` references
 * (fork `src/recall.js:149`); `recallSession` (`:196`) expands them under
 * `maxRecallTokens`.
 */
export function recall(sessionShaped, fork, type, id, maxRecallTokens) {
  const { selections, errors } = fork.resolveRecallReference(sessionShaped, type, id);
  if (errors.length > 0) return { ok: false, errors };
  const result = fork.recallSession(sessionShaped, selections, {
    maxRecallTokens: maxRecallTokens ?? fork.DEFAULT_MAX_RECALL_TOKENS,
  });
  return { ok: true, ...result };
}

/**
 * Bounded regex search over the durable log, using the fork's `searchSession`
 * (`src/search.js:54`) — capped at `maxSearchHits` events and `MAX_LINES_PER_HIT`
 * lines per event, plus the shared token budget.
 */
export function search(sessionShaped, fork, pattern, opts = {}) {
  return fork.searchSession(sessionShaped, pattern, {
    maxRecallTokens: opts.maxRecallTokens ?? fork.DEFAULT_MAX_RECALL_TOKENS,
    maxSearchHits: opts.maxSearchHits ?? fork.DEFAULT_MAX_SEARCH_HITS,
  });
}
