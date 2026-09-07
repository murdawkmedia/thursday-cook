import fs from "fs";
import zlib from "zlib";

import { readArtifact } from "./packages/session/src/read.mjs";
import { loadSessionModel } from "./packages/session/src/runtime.mjs";
import { loadCompactionFork } from "./packages/session/src/runtime.mjs";
import { planRepair, applyRepair, verifyRepair } from "./packages/session/src/repair.mjs";
import { runDiagnostics } from "./packages/session/src/diagnose.mjs";

const model = await loadSessionModel();
const fork = await loadCompactionFork();

const artifact = await readArtifact('/home/sid/.dsh/sessions/--home-sid-repos-aidos--/0caba3d9-0d38-4d43-84fb-4e77deb9f39b/session.jsonl.zstd');
const realLines = artifact.plaintext.split('\n').filter(l => l.length > 0);

let chunkRow = null;
for (const line of realLines) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'reasoning-chunks') {
      chunkRow = obj;
      break;
    }
  } catch {}
}

if (!chunkRow) {
  console.log('✗ Could not find chunk row');
  process.exit(1);
}

const chunkEvents = model.decodeStorageRecord(chunkRow);
console.log(`Found ${chunkEvents.length}-event chunk row`);

const lines = [
  JSON.stringify({ type: "session", cwd: "/test" }),
  JSON.stringify({ type: "step/start", seq: 0, time: Date.now() }),
  JSON.stringify({ type: "assistant/chunk", seq: 1, time: Date.now() }),
  JSON.stringify({ type: "assistant/chunk", seq: 2, time: Date.now() }),
  JSON.stringify({...chunkRow, seq0: 3}),
  JSON.stringify({ type: "step/end", seq: 12, time: Date.now() }),
  JSON.stringify({ type: "turn/end", seq: 13, time: Date.now() }),
];

function encodeFrames(lines) {
  const frames = [];
  frames.push(zlib.zstdCompressSync(Buffer.from(lines[0] + "\n", "utf8")));
  for (let i = 1; i < lines.length; i += 2) {
    const chunk = lines.slice(i, i + 2).join("\n") + "\n";
    frames.push(zlib.zstdCompressSync(Buffer.from(chunk, "utf8")));
  }
  return Buffer.concat(frames);
}

const corruptedLines = [...lines];
corruptedLines[4] = corruptedLines[4].slice(0, Math.floor(corruptedLines[4].length / 2));
const corruptedFile = "/tmp/test-multi-event-corrupted.jsonl.zstd";
fs.writeFileSync(corruptedFile, encodeFrames(corruptedLines));

const opened = await readArtifact(corruptedFile);
const diagnosis = runDiagnostics(opened, model, fork);
const plan = planRepair(diagnosis, { dropUnparsable: true });
const repairedFile = "/tmp/test-multi-event-repaired.jsonl.zstd";
const result = await applyRepair(corruptedFile, plan, repairedFile);

const repaired = await readArtifact(repairedFile);
const repairedLines = repaired.plaintext.split("\n").filter(l => l.length > 0);

let substitutesCreated = 0;
for (const line of repairedLines) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === "session/repair-substitute") {
      substitutesCreated++;
    }
  } catch {}
}

const verified = await verifyRepair(corruptedFile, repairedFile, result.droppedLines);

console.log(`\n=== MULTI-EVENT TEST ===`);
console.log(`Chunk row: ${chunkEvents.length} events (seq 3-${3+chunkEvents.length-1})`);
console.log(`Expected ${chunkEvents.length} substitutes, got ${substitutesCreated}`);
console.log(`dshCanOpen: ${verified.dshCanOpen}, ok: ${verified.ok}`);

if (substitutesCreated === chunkEvents.length && verified.ok && verified.dshCanOpen) {
  console.log(`✓ PASS`);
  process.exit(0);
} else {
  console.log(`✗ FAIL`);
  if (verified.problems.length > 0) console.log(`  ${verified.problems.join("; ")}`);
  process.exit(1);
}
