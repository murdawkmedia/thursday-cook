#!/usr/bin/env node
/**
 * run-tests.mjs — tests for skills/writeup-outline.
 * Run: THURSDAY_REPO=/home/sid/repos/thursday node --test run-tests.mjs
 * (THURSDAY_REPO defaults below to the Thursday checkout when unset.)
 *
 * Integration tests shell out to extract.mjs on REAL pilot sessions:
 *   short: 0e3e7b61-… (dead SUBAGENT log — stable bytes, determinism-proof)
 *   long:  test-fixtures/long-snapshot.jsonl.zstd (frozen copy of the live
 *          HUMAN log, which is still being appended to — see report)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.THURSDAY_REPO ??= "/home/sid/repos/thursday";
const FIX = path.join(HERE, "test-fixtures");
const SHORT_ID = "0e3e7b61-5857-4ffc-b27a-868b39c2e462";
const PROJECT = "--home-sid-ai-scratch--";
const SNAPSHOT = path.join(FIX, "long-snapshot.jsonl.zstd");
/**
 * The frozen long-session snapshot is 21 MB and is NOT committed: a repository
 * should not carry a binary blob that size to test a text extractor, and the
 * log it came from is private session data. Tests needing it SKIP, with the
 * command that recreates it, rather than failing and teaching the next reader
 * that a red suite is normal.
 *
 * Recreate:
 *   cp ~/.dsh/sessions/--home-sid-ai-scratch--/session-da8e225c-<rest>/session.jsonl.zstd
 *      skills/writeup-outline/test-fixtures/long-snapshot.jsonl.zstd
 *
 * The path is spelled with <rest> rather than a glob on purpose: a `*` followed
 * by `/` closes a block comment, which is exactly how this file broke once.
 */
const HAVE_SNAPSHOT = fs.existsSync(SNAPSHOT);
const snapshotSkip = { skip: HAVE_SNAPSHOT ? false : "long-snapshot.jsonl.zstd absent (21MB, not committed) — see comment for the copy command" };

const ex = await import(path.join(HERE, "extract.mjs"));

function runExtract(args, env = {}) {
  return execFileSync("node", [path.join(HERE, "extract.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * A directory guaranteed to be OUTSIDE any git repository.
 *
 * The committed `test-fixtures/empty-dir` could not do this job once the
 * fixtures moved into the repo: `git -C <dir> log` walks UPWARDS, so a plain
 * empty directory inside a checkout reports the enclosing repo and the
 * "no repo" case never runs. It passed only while the fixtures lived in /tmp.
 * Creating the directory under the OS temp root makes the test say what it
 * means wherever it is run from.
 */
function repoFreeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wo-norepo-"));
}

function tmpFile(name) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wo-")), name);
  return p;
}

// ---------------------------------------------------------------- unit: sensitive spans
test("flagSensitive flags email/path/hostname/token in place, never removes", () => {
  const cwd = "/home/sid/ai-scratch";
  const src = "mail sid@example.com, key sk-abcdefgh12345678, site example.com, link https://paste.rs/NmjPJ#ab, file /home/sid/ai-scratch/a/b.png, doc PLAN.md";
  const out = ex.flagSensitive(src, cwd);
  assert.match(out, /sid@example\.com \[⚑ email\]/);
  assert.match(out, /sk-abcdefgh12345678 \[⚑ maybe-secret\]/);
  assert.match(out, /example\.com \[⚑ hostname\]/);
  assert.match(out, /https:\/\/paste\.rs \[⚑ hostname\]\/NmjPJ#ab/);
  assert.match(out, /\/home\/sid\/ai-scratch\/a\/b\.png \[⚑ path\]/);
  assert.ok(!out.includes("PLAN.md [⚑"), "filename flagged as hostname");
  // the original spans survive verbatim (flag, do not delete)
  for (const span of ["sid@example.com", "sk-abcdefgh12345678", "example.com", "paste.rs", "/home/sid/ai-scratch/a/b.png", "PLAN.md"])
    assert.ok(out.includes(span), `lost span: ${span}`);
});

test("flagSensitive leaves uuids alone (references, not secrets)", () => {
  const out = ex.flagSensitive("session 0e3e7b61-5857-4ffc-b27a-868b39c2e462 ended", "/home/sid/ai-scratch");
  assert.ok(!out.includes("[⚑"), `uuid flagged: ${out}`);
});

// ---------------------------------------------------------------- unit: beats are data-driven
test("matchBeats uses word boundaries", () => {
  assert.deepEqual(ex.matchBeats("Perfect! Ship it.", ["perfect", "ship it"]), ["perfect", "ship it"]);
  assert.deepEqual(ex.matchBeats("it works perfectly now", ["perfect"]), []);
  assert.deepEqual(ex.matchBeats("GOOD JOB, agent", ["good job"]), ["good job"]);
});

// ---------------------------------------------------------------- unit: titles + buckets
test("pickTitle: last wins; none is a real state", () => {
  assert.deepEqual(ex.pickTitle([]), { title: null, seq: null });
  const evs = [
    { type: "session/title", seq: 11, data: { title: "first" } },
    { type: "session/title", seq: 33, data: { title: "second" } },
  ];
  assert.deepEqual(ex.pickTitle(evs), { title: "second", seq: 33 });
});

test("bucketPrompts: contiguous, complete, at most 12", () => {
  const ps = Array.from({ length: 25 }, (_, i) => ({ seq: i, time: i, text: `p${i}` }));
  const bs = ex.bucketPrompts(ps);
  assert.ok(bs.length <= 12);
  assert.deepEqual(
    bs.flat().map((p) => p.seq),
    ps.map((p) => p.seq),
  );
  assert.deepEqual(ex.bucketPrompts([]), []);
});

// ---------------------------------------------------------------- determinism on the dead short log
test("determinism: same short session twice is byte-identical", () => {
  const a = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`]);
  const b = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`]);
  assert.equal(sha(a), sha(b));
  assert.ok(a.length > 1000, "outline unexpectedly small");
});

// ---------------------------------------------------------------- determinism at scale (frozen snapshot)
test("determinism: frozen long snapshot twice is byte-identical", snapshotSkip, () => {
  const a = runExtract(["--session", SNAPSHOT]);
  const b = runExtract(["--session", SNAPSHOT]);
  assert.equal(sha(a), sha(b));
  assert.ok(a.length > 10000, "long outline unexpectedly small");
});

// ---------------------------------------------------------------- subagent attribution
test("subagent session: no user-words quotes; dispatch labelled, beats skipped", () => {
  const out = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`]);
  // No *attribution* of text to the human: quote markers are the tell.
  // (The legend and section headers may name the [user] tag; quotes may not.)
  assert.ok(!out.includes("verbatim [user]"), "subagent text quoted as the user's words");
  assert.ok(!out.includes("[user] (seq"), "subagent text quoted as the user's words");
  assert.ok(!out.includes("- first: [user]"), "subagent text quoted as the user's words");
  assert.match(out, /kind: SUBAGENT/);
  assert.match(out, /\[dispatch\]/);
  assert.match(out, /NOT the human/);
  assert.match(out, /dispatch text is never scanned for beats/);
  // the dispatch text itself is present verbatim
  assert.ok(out.includes("You extract data from receipt screenshots"));
});

// ---------------------------------------------------------------- human session on the frozen snapshot
const longOutline = () =>
  runExtract(["--session", SNAPSHOT, "--context", "pilot note: receipts then dashboard", "--context-turn", "181"]);

test("human snapshot: kind HUMAN, opening prompt verbatim, beats + visuals separate", snapshotSkip, () => {
  const out = longOutline();
  assert.match(out, /kind: HUMAN/);
  assert.ok(out.includes("create a new dir expenses-2026-09-09"), "opening prompt not verbatim");
  assert.match(out, /\[user\]/);
  assert.ok(!out.includes("verbatim [dispatch]"), "human outline mislabels prompts as dispatch");
  assert.ok(!out.includes("- first: [dispatch]"), "human arc mislabels prompts as dispatch");
  assert.match(out, /## Narrative beats/);
  assert.match(out, /## Screenshot opportunities/);
  // two SEPARATE lists from different evidence
  const beatsAt = out.indexOf("## Narrative beats");
  const visAt = out.indexOf("## Screenshot opportunities");
  assert.ok(beatsAt > 0 && visAt > beatsAt);
  // context carried verbatim, attached to a moment
  assert.ok(out.includes("pilot note: receipts then dashboard"));
  assert.match(out, /attaches to: moment seq 181/);
  // bare dsh: no board here
  assert.match(out, /no board present/);
  // context peak is a gauge, never a sum
  assert.match(out, /peak cacheReadTokens \d+ \(gauge/);
});

// ---------------------------------------------------------------- beats need no code change (custom data file)
test("beats: a custom phrase file drives detection with no code change", snapshotSkip, () => {
  const beats = { phrases: ["completely remove our styling"] };
  const f = tmpFile("beats.json");
  fs.writeFileSync(f, JSON.stringify(beats));
  const out = runExtract(["--session", SNAPSHOT, "--beats", f]);
  assert.match(out, /completely remove our styling/);
  assert.match(out, /phrases from beats\.json|phrases from /);
});

// ---------------------------------------------------------------- no publishable sentence: fixed section inventory, zero generated spans
test("outline shape: fixed sections only, zero generated spans", () => {
  const out = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`]);
  const heads = out.split("\n").filter((l) => l.startsWith("## "));
  const names = heads.map((h) => h.split(" (")[0]);
  assert.deepEqual(names, [
    "## Provenance — SUBAGENT session",
    "## Arc",
    "## Agent activity",
    "## Commits",
    "## Narrative beats",
    "## Screenshot opportunities",
    "## User-supplied context",
  ]);
  assert.match(out, /generated model-written spans: 0/);
  for (const banned of ["## Introduction", "## Conclusion", "## Summary", "## Headline"])
    assert.ok(!out.includes(banned), `banned section: ${banned}`);
});

// ---------------------------------------------------------------- commits: INFERRED join via fake git; absent repo is not a failure
test("commits: fake git join lists messages marked INFERRED", () => {
  const env = { PATH: `${path.join(FIX, "fakebin")}${path.delimiter}${process.env.PATH}` };
  const out = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`, "--cwd", repoFreeDir()], env);
  assert.match(out, /\[inferred\] abc123def456 .* receipt batch 3 extracted/);
  assert.match(out, /wrong across parallel work/);
});

test("commits: no repo is a standing-alone session, not an error", () => {
  const out = runExtract(["--session", SHORT_ID, `--project=${PROJECT}`, "--cwd", repoFreeDir()]);
  assert.match(out, /no git repo at .* — commit join skipped \(the session stands alone\)/);
});
