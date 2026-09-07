/**
 * READ a session artifact from disk and turn it into the SESSION-SHAPED VALUE
 * that the pinned compaction fork's functions consume.
 *
 * READING NEVER WRITES. Every function in this module opens files `r` only.
 * That is safety property 2 from the ticket, and `thursday session diagnose`
 * proves it with a before/after checksum rather than asserting it.
 *
 * Division of labour, stated precisely:
 *
 *   - The zstd CONTAINER walk (concatenated independent frames -> plaintext) is
 *     done here with Node's own `zlib` zstd streams. It is re-derived, not
 *     reused, for one reason: dsh's `dsh-session-persistence-jsonl` implements
 *     it (`scanZstdFrames`, `decompressZstdFrame`, `scanLog`) but does not
 *     EXPORT it — `lib/index.js`'s only export statement is
 *     `export { JsonlCompressionSchema, JsonlSessionPersistence, ... }`.
 *     Reaching those functions needs a constructed cordis plugin and Context.
 *     This is the one place the ticket's "do not reimplement" rule could not be
 *     honoured, and REPORT.md says so plainly.
 *
 *   - Every line's MEANING is dsh's own: `decodeStorageRecord` from
 *     `@deepseek-ai/dsh-session/lib/types/chunk-rows.js` expands packed
 *     `text-chunks` / `reasoning-chunks` / `tool-call-chunks` storage rows back
 *     into the exact original events. We never interpret a row ourselves.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

/** Suffixes dsh writes, per `JsonlCompression`. */
export const LOG_SUFFIXES = [".jsonl.zstd", ".jsonl"];

/** A structural problem found while reading. Never thrown — always collected. */
export class ReadIssue {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message one human-readable line
   * @param {object} [where] byte offset / line number / seq, when known
   */
  constructor(code, message, where = {}) {
    this.code = code;
    this.message = message;
    Object.assign(this, where);
  }
}

/** SHA-256 of a file's bytes, for the read-never-writes proof. */
export function checksumFile(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Decompress ONE zstd frame from `buf` at offset 0, reporting how many input
 * bytes that frame occupied.
 *
 * dsh writes one independent frame per durable batch and concatenates them, so
 * a whole-file `zstdDecompressSync` returns only the FIRST batch — measured on
 * a real 215 447-byte log it returned 259 of 551 549 plaintext bytes. A
 * decompress stream stops at a frame boundary and its `bytesWritten` is exactly
 * that frame's input length, which is what lets us advance.
 *
 * @param {Buffer} buf bytes beginning at a frame boundary
 * @returns {Promise<{out: Buffer, consumed: number}>}
 */
function decodeOneZstdFrame(buf) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const s = zlib.createZstdDecompress();
    s.on("data", (c) => chunks.push(c));
    s.on("end", () => resolve({ out: Buffer.concat(chunks), consumed: s.bytesWritten }));
    s.on("error", reject);
    s.end(buf);
  });
}

/**
 * Walk a concatenated-zstd-frame container.
 *
 * A structurally incomplete FINAL frame is a torn tail — the normal shape of a
 * log whose process died mid-append — and is reported, never treated as fatal:
 * the committed prefix before it is still entirely good data. This mirrors the
 * committed-prefix semantics of dsh's own reader.
 *
 * @param {Buffer} bytes whole artifact
 * @returns {Promise<{plaintext: Buffer, frames: Array<{start:number,end:number,plaintextBytes:number}>, tornStart: number|null, issues: ReadIssue[]}>}
 */
export async function decodeZstdContainer(bytes) {
  const frames = [];
  const parts = [];
  const issues = [];
  let offset = 0;
  let tornStart = null;
  while (offset < bytes.length) {
    let frame;
    try {
      frame = await decodeOneZstdFrame(bytes.subarray(offset));
    } catch (e) {
      tornStart = offset;
      issues.push(
        new ReadIssue(
          "zstd-torn-tail",
          `incomplete or invalid final zstd frame at byte ${offset}: ${e.message}. ` +
            `The ${frames.length} complete frame(s) before it are intact.`,
          { byteOffset: offset },
        ),
      );
      break;
    }
    if (frame.consumed <= 0) {
      // Cannot advance: refuse to spin. Treat the remainder as torn.
      tornStart = offset;
      issues.push(
        new ReadIssue(
          "zstd-no-progress",
          `zstd decoder consumed 0 bytes at offset ${offset}; treating the remainder as a torn tail`,
          { byteOffset: offset },
        ),
      );
      break;
    }
    // TORN-FRAME DETECTION, signal 1 of 2.
    //
    // Node's zstd decoder does NOT error on a truncated frame: measured on a
    // real artifact cut 5, 40 and 1500 bytes short, `zstdDecompressSync` and
    // the stream both returned cleanly with ZERO output bytes. So "it threw"
    // is not available as an oracle, and this is where dsh's own
    // `scanZstdFrames` — which validates frame structure WITHOUT
    // decompressing, and is not exported (see the module header) — would be
    // the better tool.
    //
    // The structural stand-in: dsh never writes an empty durable batch, so a
    // frame that consumed input and produced no plaintext is always an
    // incomplete frame. We stop BEFORE it, preserving exactly the committed
    // prefix semantics of dsh's own reader.
    if (frame.out.length === 0) {
      tornStart = offset;
      issues.push(
        new ReadIssue(
          "zstd-torn-tail",
          `incomplete final zstd frame at byte ${offset} (${bytes.length - offset} byte(s) of it present, ` +
            `decoded to 0 bytes of plaintext). The ${frames.length} complete frame(s) before it are intact.`,
          { byteOffset: offset },
        ),
      );
      break;
    }
    frames.push({
      start: offset,
      end: offset + frame.consumed,
      plaintextBytes: frame.out.length,
    });
    parts.push(frame.out);
    offset += frame.consumed;
  }
  const plaintext = Buffer.concat(parts);
  // TORN-FRAME DETECTION, signal 2 of 2.
  //
  // Catches the case signal 1 misses: a final frame truncated far enough into
  // its last block that the decoder still emitted some plaintext, but cut
  // mid-record. dsh's writer always terminates a batch's lines with a newline
  // (`eventLines` returns lines without a trailing newline and the writer adds
  // the final one), so decoded plaintext that does not end in "\n" means the
  // last record is incomplete.
  if (plaintext.length > 0 && plaintext[plaintext.length - 1] !== 0x0a) {
    if (tornStart === null) tornStart = frames.length > 0 ? frames[frames.length - 1].start : 0;
    issues.push(
      new ReadIssue(
        "zstd-torn-record",
        `the last decoded frame ends mid-record (no trailing newline), so its final event line is incomplete`,
        { byteOffset: tornStart },
      ),
    );
  }
  return { plaintext, frames, tornStart, issues };
}

/**
 * Read an artifact's bytes and decode it to JSONL plaintext.
 * Chooses the container from the filename suffix, exactly as dsh does
 * (`logSuffix()` in the jsonl backend's format module).
 *
 * @param {string} file
 * @returns {Promise<{file:string, bytes:number, checksum:string, plaintext:string, frames:Array, tornStart:number|null, issues:ReadIssue[], compression:'zstd'|'none'}>}
 */
export async function readArtifact(file) {
  const raw = fs.readFileSync(file);
  const checksum = createHash("sha256").update(raw).digest("hex");
  if (file.endsWith(".jsonl.zstd")) {
    const c = await decodeZstdContainer(raw);
    return {
      file,
      bytes: raw.length,
      checksum,
      plaintext: c.plaintext.toString("utf8"),
      frames: c.frames,
      tornStart: c.tornStart,
      issues: c.issues,
      compression: "zstd",
    };
  }
  return {
    file,
    bytes: raw.length,
    checksum,
    plaintext: raw.toString("utf8"),
    frames: [],
    tornStart: null,
    issues: [],
    compression: "none",
  };
}

/**
 * Parse decoded JSONL plaintext into a header plus the event list.
 *
 * Line 1 is the header record (`type: "session"`). Every later line is a
 * storage record, and `decodeStorageRecord` (dsh's own, from
 * `@deepseek-ai/dsh-session/lib/types/chunk-rows.js`) turns it into the events
 * it stores — one for a plain event, many for a packed chunk run.
 *
 * A line that will not parse, or a row `decodeStorageRecord` rejects, is
 * RECORDED and SKIPPED. It never aborts the read: keeping the good events either
 * side of a bad line is the entire point of a doctor.
 *
 * @param {string} plaintext
 * @param {{decodeStorageRecord: Function}} model layer A
 */
export function parseSessionLog(plaintext, model) {
  const issues = [];
  const lines = plaintext.split("\n");
  // A trailing newline yields one empty final element; that is not a torn line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  else if (lines.length > 0)
    issues.push(
      new ReadIssue(
        "no-trailing-newline",
        `the last line has no trailing newline — it may be a torn final record`,
        { line: lines.length },
      ),
    );

  let header;
  const events = [];
  const rawRecords = [];
  lines.forEach((text, i) => {
    const lineNo = i + 1;
    if (text.length === 0) {
      issues.push(new ReadIssue("empty-line", `line ${lineNo} is empty`, { line: lineNo }));
      return;
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      issues.push(
        new ReadIssue("unparsable-line", `line ${lineNo} is not valid JSON: ${e.message}`, {
          line: lineNo,
          preview: text.slice(0, 120),
        }),
      );
      return;
    }
    if (i === 0) {
      if (value?.type === "session") {
        header = value;
        return;
      }
      issues.push(
        new ReadIssue(
          "missing-header",
          `line 1 is not a session header record (its type is ${JSON.stringify(value?.type)})`,
          { line: 1 },
        ),
      );
      // fall through: treat it as a record, so nothing is silently dropped
    }
    rawRecords.push({ line: lineNo, value });
    try {
      for (const ev of model.decodeStorageRecord(value)) events.push({ ...ev, __line: lineNo });
    } catch (e) {
      issues.push(
        new ReadIssue(
          "undecodable-record",
          `line ${lineNo} is a storage row dsh's decodeStorageRecord rejected: ${e.message}`,
          { line: lineNo, type: value?.type },
        ),
      );
    }
  });

  return { header, events, rawRecords, issues, lineCount: lines.length };
}

/**
 * Build the SESSION-SHAPED VALUE the compaction fork consumes.
 *
 * The fork indexes BY SEQ, not by position — `recall.js:212` does
 * `const event = session.events[seq]` and `recall.js:213` rejects it unless
 * `event.seq === seq`; `search.js:63-65` iterates `seq` from 0 to
 * `events.length` and skips any slot whose `event.seq !== seq`. So `events`
 * MUST be a seq-indexed array. Building it that way is not a workaround: it is
 * what makes a seq gap or a duplicate seq VISIBLE rather than silently
 * corrupting recall, and `diagnose.mjs` reports exactly that.
 *
 * `deriveEventMessage` is dsh's own per-node projection rule, wired in as the
 * optional callback the fork's duck type asks for (its `types/recall.d.ts:47`).
 *
 * @param {Array} events dense ordered event list from `parseSessionLog`
 * @param {{deriveEventMessage: Function}} model layer A
 * @returns {{events: Array, deriveEventMessage: Function, ordered: Array, bySeqIssues: ReadIssue[]}}
 */
export function toSessionShaped(events, model) {
  const bySeq = [];
  const bySeqIssues = [];
  const seen = new Map();
  for (const ev of events) {
    const seq = ev.seq;
    if (!Number.isInteger(seq) || seq < 0) {
      bySeqIssues.push(
        new ReadIssue("bad-seq", `an event has a non-integer seq ${JSON.stringify(seq)}`, {
          line: ev.__line,
          type: ev.type,
        }),
      );
      continue;
    }
    if (seen.has(seq)) {
      bySeqIssues.push(
        new ReadIssue(
          "duplicate-seq",
          `seq ${seq} appears more than once (first at line ${seen.get(seq)}, again at line ${ev.__line}); ` +
            `the fork's recall/search index by seq, so the later copy is unreachable`,
          { seq, line: ev.__line, firstLine: seen.get(seq), type: ev.type },
        ),
      );
      continue; // first wins — never silently overwrite good data
    }
    seen.set(seq, ev.__line);
    bySeq[seq] = ev;
  }
  return {
    // the fork's `RecallableSession` / `SearchableSession`
    events: bySeq,
    deriveEventMessage: model.deriveEventMessage,
    // our own dense view, for anything that wants log order
    ordered: events,
    bySeqIssues,
  };
}

/**
 * One call: file on disk -> everything downstream needs. Read-only.
 *
 * @param {string} file
 * @param {{decodeStorageRecord: Function, deriveEventMessage: Function}} model
 */
export async function openSessionFile(file, model) {
  const artifact = await readArtifact(file);
  const parsed = parseSessionLog(artifact.plaintext, model);
  const shaped = toSessionShaped(parsed.events, model);
  return {
    artifact,
    header: parsed.header,
    events: parsed.events,
    rawRecords: parsed.rawRecords,
    session: shaped,
    issues: [...artifact.issues, ...parsed.issues, ...shaped.bySeqIssues],
  };
}

// ---------------------------------------------------------------------------
// Discovery. Layout only — no parsing lives here.
// ---------------------------------------------------------------------------

/**
 * Default session roots to look in, most specific first.
 * `~/.thursday/dsh/sessions` is where a Thursday install puts them;
 * `~/.dsh/sessions` is a developer's own harness. The doctor must be explicit
 * about WHICH it inspected, so this returns every root that exists.
 */
export function defaultSessionRoots(env = process.env, home = process.env.HOME) {
  const roots = [];
  const add = (p, label) => {
    if (p && fs.existsSync(p)) roots.push({ root: p, label });
  };
  if (env.THURSDAY_SESSION_ROOT) add(env.THURSDAY_SESSION_ROOT, "$THURSDAY_SESSION_ROOT");
  if (env.THURSDAY_HOME) add(path.join(env.THURSDAY_HOME, "dsh/sessions"), "$THURSDAY_HOME/dsh/sessions");
  add(path.join(home ?? "", ".thursday/dsh/sessions"), "~/.thursday/dsh/sessions");
  if (env.DSH_HOME) add(path.join(env.DSH_HOME, "sessions"), "$DSH_HOME/sessions");
  add(path.join(home ?? "", ".dsh/sessions"), "~/.dsh/sessions");
  return roots;
}

/**
 * Find session artifacts under a root. The layout is dsh's:
 * `<root>/<projectKey>/<sessionId>/session.jsonl[.zstd]`.
 *
 * @param {string} root
 * @param {{project?: string}} [opts]
 */
export function findSessionArtifacts(root, opts = {}) {
  const out = [];
  let projects;
  try {
    projects = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    if (opts.project && p.name !== opts.project) continue;
    const projDir = path.join(root, p.name);
    let sessions;
    try {
      sessions = fs.readdirSync(projDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const s of sessions) {
      if (!s.isDirectory()) continue;
      const dir = path.join(projDir, s.name);
      for (const suffix of LOG_SUFFIXES) {
        const file = path.join(dir, `session${suffix}`);
        if (fs.existsSync(file)) {
          const st = fs.statSync(file);
          out.push({
            file,
            project: p.name,
            sessionId: s.name,
            bytes: st.size,
            mtime: st.mtimeMs,
          });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Read ONLY a log's header, by decoding only its first zstd frame.
 *
 * This is what makes `thursday session list` scale with the NUMBER of sessions
 * rather than their total size — the same reason dsh's own backend has a
 * header-only `parseHeaderMeta` path. A 5 MB log costs one small frame here.
 *
 * @param {string} file
 * @returns {Promise<object|undefined>}
 */
export async function readHeaderOnly(file) {
  const fd = fs.openSync(file, "r");
  try {
    if (file.endsWith(".jsonl.zstd")) {
      // The header is its own frame; 64 KiB is far more than one header frame.
      const buf = Buffer.alloc(Math.min(65536, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      let first;
      try {
        first = await decodeOneZstdFrame(buf);
      } catch {
        return undefined;
      }
      const line = first.out.toString("utf8").split("\n")[0];
      try {
        const v = JSON.parse(line);
        return v?.type === "session" ? v : undefined;
      } catch {
        return undefined;
      }
    }
    const buf = Buffer.alloc(Math.min(65536, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const line = buf.toString("utf8").split("\n")[0];
    try {
      const v = JSON.parse(line);
      return v?.type === "session" ? v : undefined;
    } catch {
      return undefined;
    }
  } finally {
    fs.closeSync(fd);
  }
}
