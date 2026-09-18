#!/usr/bin/env node
/**
 * writeup-outline/extract.mjs — one session in, one markdown outline out.
 * PART 1: imports, pure helpers (flags, text, sensitive spans, beats, visuals,
 * titles, buckets). See PART 2 (session loading, git join) and PART 3 (outline).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.THURSDAY_REPO ?? path.resolve(HERE, "..", "..");
const { openSessionFile, defaultSessionRoots, findSessionArtifacts, readHeaderOnly } = await import(
  pathToFileURL(path.join(REPO, "packages/session/src/read.mjs")).href
);
const { loadSessionModel } = await import(
  pathToFileURL(path.join(REPO, "packages/session/src/runtime.mjs")).href
);

// ---------------------------------------------------------------- caps (fixed = deterministic)
const MAX_BUCKETS = 12;
const MAX_HEAD = 160;
const MAX_QUOTE = 800;
const MAX_FILES = 30;
const MAX_COMMANDS = 15;
const MAX_BEAT_QUOTES = 12;
const MAX_VISUALS = 30;
const MAX_COMMITS = 50;
const MAX_LABELS = 20;

// ---------------------------------------------------------------- parsing
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`positional args not accepted: ${a}`);
    const eq = a.indexOf("=");
    if (eq > 2) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

export function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// ---------------------------------------------------------------- text helpers (pure)
export function cut(text, n) {
  const t = String(text ?? "");
  return t.length <= n ? t : t.slice(0, n) + ` […+${t.length - n} chars]`;
}

export function oneLine(text, n = MAX_HEAD) {
  return cut(String(text ?? "").replace(/\s+/gu, " ").trim(), n);
}

export function quoteBlock(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

export function humanMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d${String(h % 24).padStart(2, "0")}h`;
}

export const shortTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
export const isoTime = (ms) => new Date(ms).toISOString();

/** Plain text of a user/message event. Non-text blocks are named, never dropped. */
export function messageText(ev) {
  const c = ev?.data?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .map((b) => {
      if (b?.type === "text") return b.text ?? "";
      if (typeof b?.text === "string") return b.text;
      return `[non-text block: ${b?.type ?? "?"}]`;
    })
    .join("");
}

// ---------------------------------------------------------------- sensitive spans: FLAG in place, NEVER remove (pure)
export function flagSensitive(text, cwd = "") {
  let t = String(text ?? "");
  // Hold emails aside so the hostname pass does not flag their domain part.
  const held = [];
  t = t.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gu, (m) => {
    held.push(m);
    return `⟦EMAIL-HELD-${held.length - 1}⟧`;
  });
  const tokenRe =
    // Review of 7d2f143 found four live misses, each demonstrated against this
    // function: a JWT (no segment reaches 40 chars), a Stripe `sk_live_` key
    // (the old pattern demanded a literal `sk-`), a `github_pat_` token, and
    // an env assignment like DB_PASSWORD=... which passed through completely
    // clean. This document is written to be PUBLISHED, so a miss is not a
    // cosmetic gap.
    /\b(sk[-_][A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[bpas]-[A-Za-z0-9-]{8,}|eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}|[A-Za-z0-9+/]{40,}={0,2}|[0-9a-fA-F]{40,})\b/gu;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  t = t.replace(tokenRe, (m) => (uuidRe.test(m) ? m : `${m} [⚑ maybe-secret]`));
  t = t.replace(
    /\b((?:[A-Za-z0-9-]+\.)+(?:com|io|dev|net|org|local|lan|home|app|arpa|onion))\b/gu,
    "$1 [⚑ hostname]",
  );
  // File-ish suffixes (.md, .rs, …) count only with a URL scheme in front,
  // so PLAN.md is never flagged but https://paste.rs/x is.
  t = t.replace(/(https?:\/\/)([A-Za-z0-9.-]+)/gu, "$1$2 [⚑ hostname]");
  t = t.replace(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/gu, "$1 [⚑ hostname]");
  // KEY=value assignments whose key names a credential. Flagged whole, because
  // the value is the leak and the key is what makes it findable.
  t = t.replace(
    /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|APIKEY|API_KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*\S+)/gu,
    "$1 [⚑ maybe-secret]",
  );
  const tail = "[^\\s'\"`,;:!?)\\]>}]*";
  const roots = [`\\/home\\/${tail}`, `\\/tmp\\/${tail}`];
  if (cwd) roots.unshift(escRe(cwd) + tail);
  t = t.replace(new RegExp(`(${roots.join("|")})`, "gu"), "$1 [⚑ path]");
  t = t.replace(/⟦EMAIL-HELD-(\d+)⟧/gu, (_, i) => `${held[+i]} [⚑ email]`);
  return t;
}

// ---------------------------------------------------------------- beats + visuals (pure, data-driven)
export function matchBeats(text, phrases) {
  const hits = [];
  for (const p of phrases) {
    if (new RegExp(`\\b${escRe(p)}\\b`, "iu").test(text)) hits.push(p);
  }
  return hits.sort();
}

export function findVisuals(toolCalls, visual) {
  const extRe = new RegExp(`\\.(${visual.extensions.map(escRe).join("|")})(?![A-Za-z0-9])`, "iu");
  const out = [];
  for (const c of toolCalls) {
    const raw = c.argsRaw ?? "";
    if (!visual.tools.includes(c.name) && !extRe.test(raw)) continue;
    let artifact = null;
    try {
      const args = JSON.parse(raw);
      const strings = [];
      const walk = (v, d) => {
        if (d > 4) return;
        if (typeof v === "string") strings.push(v);
        else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
        else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, d + 1));
      };
      walk(args, 0);
      const cands = strings.filter((s) => extRe.test(s)).sort((a, b) => a.length - b.length);
      // The pointer, not the blob: first visual path span inside the
      // shortest mentioning string (a receipt path, not the whole prompt).
      const spanRe = new RegExp(
        `\\/[^\\s'"\`\\]]*?\\.(${visual.extensions.map(escRe).join("|")})(?![A-Za-z0-9])`,
        "iu",
      );
      artifact = null;
      for (const s of cands) {
        const m = s.match(spanRe);
        if (m) {
          artifact = m[0];
          break;
        }
      }
    } catch {
      /* raw not JSON */
    }
    const found = oneLine(artifact ?? raw, 200);
    out.push({ seq: c.seq, time: c.time, tool: c.name, artifact: found });
  }
  return out;
}

// ---------------------------------------------------------------- titles (pure)
export function pickTitle(events) {
  const titles = events.filter((e) => e.type === "session/title");
  if (titles.length === 0) return { title: null, seq: null };
  const last = titles[titles.length - 1];
  return { title: last?.data?.title ?? null, seq: last?.seq ?? null };
}

// ---------------------------------------------------------------- buckets (pure)
export function bucketPrompts(prompts) {
  if (prompts.length === 0) return [];
  const n = Math.min(MAX_BUCKETS, prompts.length);
  const size = Math.ceil(prompts.length / n);
  const out = [];
  for (let i = 0; i < prompts.length; i += size) out.push(prompts.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------- session location
export function resolveSessionFile(ref, flags) {
  if (ref.includes("/") || ref.endsWith(".zstd") || ref.endsWith(".jsonl")) {
    const p = path.resolve(ref);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const s of ["session.jsonl.zstd", "session.jsonl"]) {
        const f = path.join(p, s);
        if (fs.existsSync(f)) return f;
      }
    }
    throw new Error(`no session artifact at ${p}`);
  }
  const roots = flags.root
    ? [{ root: path.resolve(flags.root), label: "--root" }]
    : defaultSessionRoots(process.env, process.env.HOME);
  const all = [];
  for (const r of roots)
    for (const a of findSessionArtifacts(r.root, { project: flags.project })) all.push(a);
  const hits = all.filter((a) => a.sessionId === ref || a.sessionId.startsWith(ref));
  if (hits.length === 0) throw new Error(`no session matching "${ref}"`);
  if (hits.length > 1)
    throw new Error(
      `"${ref}" matches ${hits.length} sessions:\n` + hits.slice(0, 10).map((h) => `  ${h.sessionId}`).join("\n"),
    );
  return hits[0].file;
}

// ---------------------------------------------------------------- git: time-based join, always INFERRED
const GIT_SEP = "\x01";
export function loadCommits(cwd, startMs, endMs) {
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "log", `--format=%H${GIT_SEP}%cI${GIT_SEP}%s`, `--since=${isoTime(startMs)}`, `--until=${isoTime(endMs)}`, "--reverse"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return {
      ok: true,
      commits: out
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          const [hash, date, subject] = l.split(GIT_SEP);
          return { hash, date, subject };
        }),
    };
  } catch (e) {
    const msg = String(e?.stderr ?? e?.message ?? "");
    if (/not a git repository/i.test(msg)) return { ok: false, reason: "not-a-repo" };
    return { ok: false, reason: `git failed: ${oneLine(msg, 160)}` };
  }
}

// ---------------------------------------------------------------- outline, part A: meta + provenance + arc
function outlineHead(L, d) {
  L.push(`outline: ${d.titleText} (${d.sessionId})`);
  L.push(`- session id: ${d.sessionId}`);
  L.push(`- kind: ${d.attribution === "human" ? "HUMAN" : d.attribution === "subagent" ? "SUBAGENT" : "UNKNOWN"} (${d.attributionWhy})`);
  L.push(`- dir-name check: ${d.dirName} ${d.dirAgrees ? "(matches record 0)" : "(DIFFERS from record 0 — record 0 wins [inferred])"}`);
  if (!d.isHuman) L.push(`- parent session: ${d.parent ?? "?"} / dispatch label: ${d.dispatchLabel}`);
  L.push(`- title: ${d.titleLine}`);
  L.push(`- work dir: ${d.cwd}`);
  L.push(`- span: ${isoTime(d.startMs)} .. ${isoTime(d.endMs)} (${humanMs(d.endMs - d.startMs)})`);
  L.push(
    `- turns: ${d.turns} / steps: ${d.steps} / tool calls: ${d.toolCalls.length} / approvals asked: ${d.asked}, decided: ${d.decided}`,
  );
  L.push(`- subagents spawned: ${d.subCalls} call(s), ${d.subLabelCount} distinct label(s)${d.subLabels.length > 0 ? ` (${d.subLabels.join(" | ")})` : ""}`);
  L.push(`- inbox: ${d.reports} subagent-report(s), ${d.settled} subagent-settled(s)`);
  L.push(`- context: peak cacheReadTokens ${d.peak} (gauge [inferred]; the log carries a cumulative ledger — summed it overcounts ~100x, so peak only, never a sum)`);
  L.push(`- generated model-written spans: 0 (every line here is an extracted fact, a verbatim quote, or fixed template text)`);
  L.push(`- board: ${d.boardLine}`);
  L.push(`- legend: [user] = verbatim human words (depth-0 only) / [dispatch] = orchestrator text to a subagent, NOT the human's words / [tool] = counted from tool calls / [inferred] = a guess, stated as one / [context] = user-supplied writing, verbatim`);
  L.push("");
}

function outlineVoice(L, d, flag) {
  if (!d.isHuman) {
    L.push(`## Provenance — SUBAGENT session`);
    L.push(`- the user role in this log is the orchestrator, not the human — no line below is quoted as the user's words`);
    L.push(`- dispatch turns (user role): ${d.prompts.length} / quoted in full: ${d.dispatchFull ? "first only (remainder in Arc, labelled [dispatch])" : "none"}`);
    if (d.prompts.length > 0) {
      const p0 = d.prompts[0];
      L.push(`- dispatch text, verbatim [dispatch] (seq ${p0.seq}, ${isoTime(p0.time)}):`);
      L.push(quoteBlock(flag(cut(p0.text, MAX_QUOTE))));
    }
    L.push("");
    return;
  }
  L.push(`## Prompts — HUMAN session (${d.prompts.length} user-role prompts, all [user])`);
  if (d.prompts.length > 0) {
    const first = d.prompts[0];
    const last = d.prompts[d.prompts.length - 1];
    L.push(`- opening prompt, verbatim [user] (seq ${first.seq}, ${isoTime(first.time)}):`);
    L.push(quoteBlock(flag(cut(first.text, MAX_QUOTE))));
    if (d.prompts.length > 1) {
      L.push(`- closing prompt, verbatim [user] (seq ${last.seq}, ${isoTime(last.time)}):`);
      L.push(quoteBlock(flag(cut(last.text, MAX_QUOTE))));
    }
  } else {
    L.push(`- no user-role prompts in this log`);
  }
  L.push("");
}

function outlineArc(L, d, flag) {
  const tag = d.attribution === "human" ? "user" : d.attribution === "subagent" ? "dispatch" : "unattributed";
  L.push(`## Arc (${d.prompts.length} prompts in ${d.buckets.length} buckets; heads are verbatim prefixes, […+N chars] marks cuts)`);
  d.buckets.forEach((b, i) => {
    const t0 = shortTime(b[0].time);
    const t1 = shortTime(b[b.length - 1].time);
    L.push(`### bucket ${i + 1}/${d.buckets.length} — ${t0} .. ${t1} — ${b.length} prompt(s)`);
    L.push(`- first: [${tag}] (seq ${b[0].seq}): ${flag(oneLine(b[0].text))}`);
    const hi = i + 1 < d.buckets.length ? d.buckets[i + 1][0].seq : Number.POSITIVE_INFINITY;
    const inRange = d.toolCalls.filter((c) => c.seq >= b[0].seq && c.seq < hi);
    const hist = new Map();
    for (const c of inRange) hist.set(c.name, (hist.get(c.name) ?? 0) + 1);
    const top = [...hist.entries()].sort((a, b2) => b2[1] - a[1] || (a[0] < b2[0] ? -1 : 1)).slice(0, 3);
    L.push(`- tools in range: ${inRange.length} call(s)${top.length > 0 ? ` (${top.map(([n, c]) => `${n} x${c}`).join(", ")})` : ""}`);
    if (d.contextSeq !== null && b[0].seq <= d.contextSeq && d.contextSeq <= b[b.length - 1].seq)
      L.push(`- [context] user-supplied context attaches to this moment — see User-supplied context`);
  });
  L.push("");
}

// ---------------------------------------------------------------- outline, part B
function outlineActivity(L, d) {
  L.push(`## Agent activity (counted [tool]; names as called, never narrated)`);
  for (const [n, c] of d.toolHist) L.push(`- tool ` + "`" + n + "`" + ` x${c}`);
  L.push(`- files read: ${d.readTotal} call(s), ${d.readFiles.length} unique`);
  for (const [f, c] of d.readFiles.slice(0, MAX_FILES)) L.push(`  - ${f}${c > 1 ? ` (x${c})` : ""}`);
  if (d.readFiles.length > MAX_FILES) L.push(`  - … +${d.readFiles.length - MAX_FILES} more`);
  L.push(`- files edited/written: ${d.editTotal} call(s), ${d.editFiles.length} unique`);
  for (const [f, c] of d.editFiles.slice(0, MAX_FILES)) L.push(`  - ${f}${c > 1 ? ` (x${c})` : ""}`);
  if (d.editFiles.length > MAX_FILES) L.push(`  - … +${d.editFiles.length - MAX_FILES} more`);
  L.push(`- commands run: ${d.commands.length}`);
  for (const c of d.commands.slice(0, MAX_COMMANDS))
    L.push(`  - ${shortTime(c.time)} ${c.desc ? c.desc + " — " : ""}` + "`" + d.flag(oneLine(c.cmd)) + "`");
  if (d.commands.length > MAX_COMMANDS) L.push(`  - … +${d.commands.length - MAX_COMMANDS} more`);
  L.push("");
}

function outlineCommits(L, d) {
  L.push(`## Commits ([inferred] time-based join; wrong across parallel work)`);
  if (!d.commitInfo.ok) {
    L.push(
      d.commitInfo.reason === "not-a-repo"
        ? `- no git repo at ${d.cwd} — commit join skipped (the session stands alone)`
        : `- ${d.commitInfo.reason}`,
    );
    L.push("");
    return;
  }
  if (d.commitInfo.commits.length === 0) {
    L.push(`- git repo present at ${d.cwd}; no commits in the session span — nothing to join`);
    L.push("");
    return;
  }
  for (const c of d.commitInfo.commits.slice(0, MAX_COMMITS))
    L.push(`- [inferred] ${String(c.hash).slice(0, 12)} ${String(c.date).slice(0, 16)} ${c.subject}`);
  if (d.commitInfo.commits.length > MAX_COMMITS)
    L.push(`- … +${d.commitInfo.commits.length - MAX_COMMITS} more`);
  L.push("");
}

function outlineBeats(L, d, flag) {
  L.push(`## Narrative beats (human wording [user]; phrases from ${d.beatsName})`);
  if (!d.isHuman) {
    L.push(`- subagent session: dispatch text is never scanned for beats`);
    L.push("");
    return;
  }
  if (d.beatHits.length === 0) {
    L.push(`- no beat-phrase prompt in this session (absence is data: no praise-pattern turn found)`);
    L.push("");
    return;
  }
  for (const h of d.beatHits.slice(0, MAX_VISUALS + 10))
    L.push(`- "${h.phrase}" — [user] seq ${h.seq} @ ${shortTime(h.time)}: ${flag(oneLine(h.text))}`);
  if (d.beatHits.length > MAX_VISUALS + 10) L.push(`- … +${d.beatHits.length - MAX_VISUALS - 10} more`);
  const qs = d.beatPrompts.slice(0, MAX_BEAT_QUOTES);
  for (const p of qs) {
    L.push(`- beat prompt in full, verbatim [user] (seq ${p.seq}, ${isoTime(p.time)}):`);
    L.push(quoteBlock(flag(cut(p.text, MAX_QUOTE))));
  }
  if (d.beatPrompts.length > MAX_BEAT_QUOTES)
    L.push(`- … +${d.beatPrompts.length - MAX_BEAT_QUOTES} more beat prompt(s) quoted by head only, in Arc`);
  L.push("");
}

function outlineVisuals(L, d) {
  L.push(`## Screenshot opportunities ([tool]; turns that touched visual artifacts; patterns from ${d.visualName})`);
  if (d.visuals.length === 0) {
    L.push(`- none: no tool call touched a visual artifact`);
    L.push("");
    return;
  }
  for (const v of d.visuals.slice(0, MAX_VISUALS))
    L.push(`- seq ${v.seq} @ ${shortTime(v.time)} — tool ` + "`" + v.tool + "`" + `: ${v.artifact}`);
  if (d.visuals.length > MAX_VISUALS) L.push(`- … +${d.visuals.length - MAX_VISUALS} more`);
  L.push("");
}

function outlineContext(L, d, flag) {
  L.push(`## User-supplied context (verbatim [context]; never paraphrased, never merged into facts)`);
  if (!d.contextText) {
    L.push(`- none supplied (--context / --context-file)`);
    L.push("");
  } else {
    L.push(
      d.contextSeq !== null
        ? `- attaches to: moment seq ${d.contextSeq} (see Arc bucket holding it) AND the whole outline`
        : `- attaches to: the whole outline`,
    );
    L.push(quoteBlock(flag(d.contextText)));
    L.push(`- where this disagrees with session facts above, BOTH stand — the tool does not decide which is true`);
    L.push("");
  }
  L.push(`- produced by: skills/writeup-outline/extract.mjs (deterministic; a re-run is byte-identical)`);
}

// ---------------------------------------------------------------- collect everything from an opened session
function collect(opened, file, flags, beats, visual) {
  const events = opened.events;
  const header = opened.header ?? {};
  const sessionId = header.id ?? path.basename(path.dirname(file));
  const dirName = path.basename(path.dirname(file));
  const bareDir = dirName.replace(/^session-/, "");
  const bareId = String(header.id ?? "").replace(/^session-/, "");
  const dirAgrees = bareDir === bareId || dirName === String(header.id ?? "");

  // ATTRIBUTION FAILS CLOSED.
  //
  // Quoting orchestrator dispatch text as the human's verbatim words, in a
  // document written to be published, is the worst thing this tool can do. The
  // question is therefore not only "is this a subagent log" but "do we KNOW".
  //
  // Found by review of 7d2f143: a record 0 lacking `origin` and
  // `delegationDepth` — an older format, or a foreign log — defaulted to
  // depth 0 / origin "human", and its dispatch text was published as the
  // user's words. The directory-name signal that would have caught it was
  // computed and then ignored.
  //
  // Three states now, not two:
  //   human     record 0 says depth 0 and origin is not subagent
  //   subagent  record 0 says otherwise, OR the fields are missing and another
  //             signal points that way (parentSession, a subagent/descriptor
  //             event)
  //   unknown   the fields are missing and nothing decides it
  //
  // `unknown` quotes NOTHING as the user's words. An outline missing its
  // quotes is visibly incomplete; an outline attributing an orchestrator's
  // words to the user is not visibly anything.
  const hasOriginFields =
    Number.isInteger(header.delegationDepth) || typeof header.origin === "string";
  const depth = Number.isInteger(header.delegationDepth) ? header.delegationDepth : 0;
  let attribution;
  let attributionWhy;
  if (hasOriginFields) {
    const declared = header.origin ?? (depth > 0 ? "subagent" : "human");
    attribution = depth === 0 && declared !== "subagent" ? "human" : "subagent";
    attributionWhy = `record 0: origin ${declared}, depth ${depth}`;
  } else {
    const hasParent = typeof header.parentSession === "string" && header.parentSession.length > 0;
    const hasDescriptor = events.some((e) => e.type === "subagent/descriptor");
    if (hasParent || hasDescriptor) {
      attribution = "subagent";
      attributionWhy = `record 0 lacks origin/delegationDepth; ${hasParent ? "parentSession present" : "subagent/descriptor event present"} [inferred]`;
    } else if (dirName.startsWith("session-")) {
      attribution = "human";
      attributionWhy =
        "record 0 lacks origin/delegationDepth; directory carries the session- prefix [inferred]";
    } else {
      attribution = "unknown";
      attributionWhy =
        "record 0 lacks origin/delegationDepth and nothing else decides it — NO text is quoted as the user's words";
    }
  }
  const origin = attribution === "unknown" ? "unknown" : attribution;
  const isHuman = attribution === "human";
  const titled = pickTitle(events);
  const ordered = opened.session?.ordered ?? events;
  const startMs = Number.isFinite(header.createdAt) ? header.createdAt : (ordered[0]?.time ?? 0);
  const endMs = ordered.length > 0 ? (ordered[ordered.length - 1]?.time ?? startMs) : startMs;
  const cwd = flags.cwd ? path.resolve(flags.cwd) : header.cwd ?? process.cwd();
  const flag = (t) => flagSensitive(t, cwd);

  const prompts = events
    .filter((e) => e.type === "user/message" && e?.data?.source?.kind === "user")
    .map((e) => ({ seq: e.seq, time: e.time, text: messageText(e) }))
    .sort((a, b) => a.seq - b.seq);

  const toolCalls = events
    .filter((e) => e.type === "tool/call")
    .map((e) => ({ seq: e.seq, time: e.time, name: e?.data?.name ?? "?", argsRaw: e?.data?.arguments ?? "" }))
    .sort((a, b) => a.seq - b.seq);
  const parseArgsOf = (c) => {
    try {
      const v = JSON.parse(c.argsRaw);
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  };
  const toolHist = [
    ...toolCalls.reduce((m, c) => m.set(c.name, (m.get(c.name) ?? 0) + 1), new Map()).entries(),
  ].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const fileOf = (a) => a.file_path ?? a.path ?? a.file ?? null;
  const reads = new Map();
  const edits = new Map();
  let readTotal = 0;
  let editTotal = 0;
  const commands = [];
  const subLabelSet = new Set();
  for (const c of toolCalls) {
    const a = parseArgsOf(c);
    if (c.name === "read" || c.name === "read_image" || c.name === "grep") {
      const f = fileOf(a);
      if (f) {
        reads.set(f, (reads.get(f) ?? 0) + 1);
        readTotal += 1;
      }
    } else if (c.name === "edit" || c.name === "write") {
      const f = fileOf(a);
      if (f) {
        edits.set(f, (edits.get(f) ?? 0) + 1);
        editTotal += 1;
      }
    } else if (c.name === "bash") {
      if (typeof a.command === "string") commands.push({ time: c.time, cmd: a.command, desc: a.description ?? "" });
    } else if (c.name === "subagent" || c.name === "subagent_fork") {
      if (typeof a.description === "string" && a.description) subLabelSet.add(a.description);
    }
  }
  const desc = events.find((e) => e.type === "subagent/descriptor")?.data;
  // Count BEFORE the cap. Slicing then reporting `.length` stated 20 distinct
  // labels for a session that had 175 — found by review of 7d2f143. Every
  // other capped list in this file counts the full array; this was the one
  // site with the slice-then-count shape.
  const subLabelCount = subLabelSet.size;
  const subLabels = [...subLabelSet].sort().slice(0, MAX_LABELS);

  let peak = 0;
  for (const e of events) {
    const u = e?.data?.chunk?.usage;
    if (u && Number.isFinite(u.cacheReadTokens)) peak = Math.max(peak, u.cacheReadTokens);
  }

  const beatHits = [];
  if (isHuman)
    for (const p of prompts) {
      const hits = matchBeats(p.text, beats.phrases);
      for (const h of hits) beatHits.push({ phrase: h, seq: p.seq, time: p.time, text: p.text });
    }
  beatHits.sort((a, b) => a.seq - b.seq || (a.phrase < b.phrase ? -1 : 1));
  const beatSeqs = [...new Set(beatHits.map((h) => h.seq))].sort((a, b) => a - b);
  let beatPrompts = beatSeqs.map((s) => prompts.find((p) => p.seq === s));
  if (beatPrompts.length > MAX_BEAT_QUOTES) {
    const head = beatPrompts.slice(0, 8);
    const tail = beatPrompts.slice(beatPrompts.length - 4);
    beatPrompts = [...head, ...tail.filter((p) => !head.includes(p))];
  }

  const visuals = findVisuals(toolCalls, visual);
  const commitInfo = loadCommits(cwd, startMs, endMs);

  let boardLine = `no board present at ${cwd} — time-and-commit structure only`;
  const refs = new Set();
  for (const p of prompts) {
    const m = p.text.match(/\b(T\d{1,4}|#\d{1,5})\b/g);
    if (m) m.forEach((t) => refs.add(t));
  }
  let boardFound = false;
  try {
    boardFound =
      fs.existsSync(path.join(cwd, ".aidos")) ||
      fs.existsSync(path.join(cwd, "PLAN.md")) ||
      fs.existsSync(path.join(cwd, "plan.md"));
  } catch {
    boardFound = false;
  }
  if (boardFound || refs.size > 0)
    boardLine =
      `enrichment only, never required${boardFound ? " (board files present)" : " (no board files)"}` +
      (refs.size > 0
        ? ` — possible ticket refs [inferred, unresolved]: ${[...refs].sort().join(", ")}`
        : " — no ticket-like refs in prompts");

  let contextText = "";
  if (flags.context) contextText = String(flags.context);
  if (flags["context-file"])
    contextText += (contextText ? "\n" : "") + fs.readFileSync(path.resolve(flags["context-file"]), "utf8");
  const contextSeq = flags["context-turn"] !== undefined ? Number(flags["context-turn"]) : null;

  return {
    sessionId, depth, origin, isHuman, attribution, attributionWhy, dirName, dirAgrees, subLabelCount,
    parent: header.parentSession ?? null,
    dispatchLabel: desc?.label ?? "(no subagent/descriptor)",
    titleText: titled.title ?? "UNTITLED",
    titleLine: titled.title ?? "UNTITLED (no session/title event — untitled is a real state, not an error)",
    cwd, startMs, endMs,
    turns: events.filter((e) => e.type === "turn/start").length,
    steps: events.filter((e) => e.type === "step/start").length,
    toolCalls, toolHist,
    asked: events.filter((e) => e.type === "approval/asked").length,
    decided: events.filter((e) => e.type === "approval/decided").length,
    reports: events.filter((e) => e.type === "user/message" && e?.data?.source?.kind === "subagent-report").length,
    settled: events.filter((e) => e.type === "user/message" && e?.data?.source?.kind === "subagent-settled").length,
    subLabels,
    subCalls: toolCalls.filter((c) => c.name === "subagent" || c.name === "subagent_fork").length,
    peak, prompts,
    readTotal, editTotal,
    readFiles: [...reads.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    editFiles: [...edits.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    commands,
    buckets: bucketPrompts(prompts),
    dispatchFull: prompts.length > 0,
    beatHits, beatPrompts,
    beatsName: path.basename(flags.beats || "beats.json"),
    visuals, visualName: path.basename(flags.visual || "visual.json"),
    commitInfo, boardLine, contextText, contextSeq,
    flag,
  };
}

// ---------------------------------------------------------------- main
/**
 * `--list`: print one line per session, each ending in the exact command that
 * produces its outline.
 *
 * HEADER-ONLY ON PURPOSE. This reads ONE zstd frame per session via
 * readHeaderOnly, which is why it can list a thousand logs in a moment. The
 * session TITLE is not in that frame — it arrives later as a `session/title`
 * event — so listing titles would mean decompressing every log in full. The
 * columns here are the ones that cost nothing: id, kind, project, date, size.
 *
 * `kind` comes from record 0's `origin` and `delegationDepth`, NOT from the
 * directory name. Both usually agree (a `session-` prefix means depth 0), but
 * the record is the source of truth and the prefix is a convention.
 */
function listSessions(flags) {
  const roots = flags.root
    ? [{ root: path.resolve(flags.root), label: "--root" }]
    : defaultSessionRoots(process.env, process.env.HOME);
  const rows = [];
  for (const r of roots)
    for (const a of findSessionArtifacts(r.root, { project: flags.project })) rows.push(a);

  // Newest first: the session you want to write about is almost always the one
  // you just had.
  rows.sort((a, b) => b.mtime - a.mtime);
  const limit = flags.limit === undefined ? 40 : Number(flags.limit);
  const shown = Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;

  const out = [];
  out.push(`${rows.length} session(s)${flags.project ? ` in ${flags.project}` : ""}, newest first`);
  out.push("");
  return { rows, shown, out };
}

async function runList(flags) {
  const { rows, shown, out } = listSessions(flags);
  for (const a of shown) {
    let head = null;
    try {
      head = await readHeaderOnly(a.file);
    } catch {
      head = null;
    }
    const depth = head?.delegationDepth ?? 0;
    const origin = head?.origin ?? "";
    const kind = depth > 0 || origin === "subagent" ? `SUBAGENT d${depth}` : "HUMAN";
    const size = a.bytes < 1048576 ? `${Math.round(a.bytes / 1024)}K` : `${(a.bytes / 1048576).toFixed(1)}M`;
    const when = new Date(a.mtime).toISOString().slice(0, 16).replace("T", " ");
    out.push(`${when}  ${size.padStart(6)}  ${kind.padEnd(13)}  ${a.sessionId}`);
    out.push(
      `    node skills/writeup-outline/extract.mjs --session ${a.sessionId} --project=${a.project}`,
    );
    out.push("");
  }
  if (shown.length < rows.length) {
    out.push(`… ${rows.length - shown.length} more (--limit N, or --limit 0 for all)`);
    out.push("");
  }
  out.push("Titles are omitted: the title is not in the header frame, so listing them");
  out.push("would mean decompressing every log in full. Run a command above to see one.");
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

async function main(argv) {
  const flags = parseArgs(argv);
  if (flags.list === true) return runList(flags);
  if (!flags.session || flags.help === true || flags.h === true) {
    process.stdout.write(
      "writeup-outline: one session in, one markdown outline out\n\n  node extract.mjs --list [--project <key>] [--limit N]\n    print every session, newest first, each with the command that outlines it\n\n  node extract.mjs --session <id|path> [--root <dir>] [--project <key>]\n    [--out <file>] [--cwd <dir>] [--context \"...\"] [--context-file <f>]\n    [--context-turn <seq>] [--beats <file>] [--visual <file>]\n",
    );
    return flags.session ? 0 : 2;
  }
  const file = resolveSessionFile(String(flags.session), flags);
  const beats = JSON.parse(fs.readFileSync(path.resolve(flags.beats ?? path.join(HERE, "beats.json")), "utf8"));
  const visual = JSON.parse(fs.readFileSync(path.resolve(flags.visual ?? path.join(HERE, "visual.json")), "utf8"));
  const model = await loadSessionModel({});
  const opened = await openSessionFile(file, model);
  const d = collect(opened, file, flags, beats, visual);
  const L = [];
  outlineHead(L, d);
  outlineVoice(L, d, d.flag);
  outlineArc(L, d, d.flag);
  outlineActivity(L, d);
  outlineCommits(L, d);
  outlineBeats(L, d, d.flag);
  outlineVisuals(L, d);
  outlineContext(L, d, d.flag);
  const text = L.join("\n") + "\n";
  if (flags.out) fs.writeFileSync(path.resolve(flags.out), text);
  else process.stdout.write(text);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(2);
    },
  );
}
