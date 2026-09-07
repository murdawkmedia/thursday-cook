/**
 * Build DELIBERATELY CORRUPTED session logs from a real one.
 *
 * These are not synthetic toys. Each fixture starts as the byte-exact decoded
 * plaintext of a real dsh session artifact, and injects exactly ONE genuine
 * structural defect of a class that really occurs:
 *
 *   duplicate-seq  two records claiming the same seq. Occurs when a partial
 *                  append is retried without the size rollback dsh's
 *                  `rollbackAppend` performs.
 *   seq-gap        a record deleted from the middle. Occurs after a hand-edit
 *                  or a bad merge of two logs.
 *   unparsable     a record truncated mid-JSON. Occurs when a write is torn at
 *                  a byte boundary inside a line rather than at a frame.
 *   torn-frame     the zstd container truncated inside its final frame. The
 *                  ordinary shape of a log whose process was killed mid-append.
 *   open-turn      the log cut immediately after a `tool/call`, leaving a turn
 *                  with an unmatched call. This is what dsh's own
 *                  `interruptedTurnClosers` exists to repair.
 *
 * Usage:  node make-fixtures.mjs <real-session.jsonl.zstd> <outDir>
 *
 * Every fixture is written alongside a `.expected.json` naming the defect and
 * the ORIGINAL record count, so a test can prove the repair kept the good data.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { readArtifact } from "../src/read.mjs";

/** Compress each line group as its own zstd frame, the way dsh writes batches. */
function encodeFrames(lines, perFrame = 8) {
  const frames = [];
  for (let i = 0; i < lines.length; i += perFrame) {
    const chunk = lines.slice(i, i + perFrame).join("\n") + "\n";
    frames.push(zlib.zstdCompressSync(Buffer.from(chunk, "utf8")));
  }
  return Buffer.concat(frames);
}

/**
 * @param {string} source a real `session.jsonl.zstd`
 * @param {string} outDir where to write the fixtures
 */
export async function makeFixtures(source, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const art = await readArtifact(source);
  const lines = art.plaintext.split("\n").filter((l) => l.length > 0);
  const made = [];

  const write = (name, bytes, expected) => {
    const dir = path.join(outDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "session.jsonl.zstd");
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(
      path.join(dir, "expected.json"),
      JSON.stringify({ ...expected, fixture: name, sourceLines: lines.length }, null, 2) + "\n",
    );
    made.push({ name, file, expected });
    return file;
  };

  // --- 0. PRISTINE control. Same pipeline, no defect. A diagnosis that flags
  //        this would be a false positive, so every run checks it first.
  write("pristine", encodeFrames(lines), {
    defect: "none",
    expectCodes: [],
    goodRecords: lines.length,
  });

  // --- 1. duplicate-seq: re-append an existing record verbatim.
  {
    const dupIndex = Math.floor(lines.length * 0.6);
    const copy = [...lines];
    const dup = copy[dupIndex];
    copy.splice(dupIndex + 1, 0, dup);
    const seq = JSON.parse(dup).seq;
    write("duplicate-seq", encodeFrames(copy), {
      defect: "duplicate-seq",
      expectCodes: ["duplicate-seq"],
      duplicatedSeq: seq,
      duplicatedAtLine: dupIndex + 2,
      goodRecords: lines.length,
    });
  }

  // --- 2. seq-gap: delete one record from the middle.
  {
    const dropIndex = Math.floor(lines.length * 0.5);
    const dropped = JSON.parse(lines[dropIndex]);
    const copy = [...lines];
    copy.splice(dropIndex, 1);
    write("seq-gap", encodeFrames(copy), {
      defect: "seq-gap",
      expectCodes: ["seq-gap"],
      droppedSeq: dropped.seq,
      droppedType: dropped.type,
      goodRecords: lines.length - 1,
    });
  }

  // --- 3. unparsable: cut a record in half, mid-JSON.
  {
    const badIndex = Math.floor(lines.length * 0.4);
    const copy = [...lines];
    copy[badIndex] = copy[badIndex].slice(0, Math.floor(copy[badIndex].length / 2));
    write("unparsable-line", encodeFrames(copy), {
      defect: "unparsable-line",
      expectCodes: ["unparsable-line", "seq-gap"],
      badLine: badIndex + 1,
      goodRecords: lines.length - 1,
    });
  }

  // --- 4. torn-frame: truncate the container inside its last frame.
  {
    const full = encodeFrames(lines);
    // Cut 40 bytes off the end: enough to break the final frame, not the ones before.
    const torn = full.subarray(0, full.length - 40);
    write("torn-frame", torn, {
      defect: "torn-frame",
      expectCodes: ["torn-tail"],
      originalBytes: full.length,
      tornBytes: torn.length,
      goodRecords: "the committed prefix before the torn frame",
    });
  }

  // --- 5. open-turn: cut the log right after a tool/call, so the turn has an
  //        unmatched call and no turn/end. dsh's interruptedTurnClosers is the
  //        rule that repairs exactly this.
  {
    let cutAt = -1;
    for (let i = lines.length - 1; i > 0; i -= 1) {
      let v;
      try {
        v = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (v.type === "tool/call") {
        cutAt = i;
        break;
      }
    }
    if (cutAt > 0) {
      const copy = lines.slice(0, cutAt + 1);
      write("open-turn", encodeFrames(copy), {
        defect: "open-turn",
        expectCodes: ["open-turn", "unbalanced-tail"],
        cutAfterLine: cutAt + 1,
        goodRecords: copy.length,
      });
    }
  }

  fs.writeFileSync(
    path.join(outDir, "INDEX.json"),
    JSON.stringify({ source, sourceLines: lines.length, fixtures: made.map((m) => m.name) }, null, 2) + "\n",
  );
  return made;
}

// Robust main-module guard: node resolves argv[1] through symlinks, so a
// plain string compare against import.meta.url fails when this file is reached
// via a symlinked checkout. Compare real paths instead.
const __isMain = (() => {
  try {
    return fs.realpathSync(new URL(import.meta.url).pathname) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (__isMain) {
  const [source, outDir] = process.argv.slice(2);
  if (!source || !outDir) {
    console.error("usage: node make-fixtures.mjs <real-session.jsonl.zstd> <outDir>");
    process.exit(2);
  }
  makeFixtures(source, outDir).then((made) => {
    for (const m of made) console.log(`${m.name.padEnd(16)} ${m.expected.defect.padEnd(16)} ${m.file}`);
  });
}
