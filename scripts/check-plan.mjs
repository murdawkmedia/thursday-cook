#!/usr/bin/env node
// check-plan.mjs — assert the structural properties of PLAN.md's ticket graph.
//
// Two independent reviews of this plan spent most of their effort building the
// dependency graph by hand to find dangling references, a cycle, missing
// reciprocity, and phase-reach claims that did not hold. That is mechanical
// work being done by an expensive reviewer. This script does it in
// milliseconds so a review can spend its attention on meaning instead.
//
// It reports; it never edits. Exit 0 means the graph is sound.
//
// Usage: node scripts/check-plan.mjs [path-to-PLAN.md]

import { readFileSync } from "node:fs";

const TICKET_LINE = /^- \[([ ~?x])\] \*\*Ticket ([^:]+): (.+?)\.\*\*\s?(.*)$/;
const PHASE_HEADING = /^## Phase (\d+): (.+?) —/;
const CRITERIA_MARKER = "**Evaluate:**";
const BLOCKED_BY = /\bBlocked by ([^.]+)\./g;
const BLOCKS = /\bBlocks ([^.]+)\./g;

const path = process.argv[2] ?? "PLAN.md";
const lines = readFileSync(path, "utf8").split("\n");

/** Parse every ticket into {id, title, line, phase, body, criteria[]}. */
function parse() {
  const tickets = [];
  let phase = 1;
  let phaseTitle = "(none)";
  for (let i = 0; i < lines.length; i++) {
    const heading = PHASE_HEADING.exec(lines[i]);
    if (heading) {
      phase = Number(heading[1]);
      phaseTitle = heading[2];
      continue;
    }
    const match = TICKET_LINE.exec(lines[i]);
    if (!match) continue;

    // The ticket runs until the next ticket line or a non-indented line that
    // is not blank. Continuation lines start with two spaces.
    const body = [match[4]];
    const criteria = [];
    let seenMarker = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (TICKET_LINE.test(line)) break;
      if (line.trim() !== "" && !line.startsWith("  ")) break;
      const text = line.trim();
      if (text === CRITERIA_MARKER) {
        seenMarker = true;
        continue;
      }
      if (!seenMarker) {
        body.push(text);
      } else if (text.startsWith("- ")) {
        criteria.push(text.slice(2));
      } else if (text !== "" && criteria.length > 0) {
        criteria[criteria.length - 1] += " " + text;
      }
    }
    tickets.push({
      id: match[2].trim(),
      title: match[3].trim(),
      line: i + 1,
      phase,
      phaseTitle,
      body: body.join(" "),
      criteria,
    });
    i = j - 1;
  }
  return tickets;
}

/** Pull every id out of a "Blocked by A, B and C." style clause. */
function idsFrom(clause) {
  return clause
    .split(/,| and /)
    .map((s) => s.trim().replace(/[`*]/g, ""))
    .filter((s) => s !== "" && s.toLowerCase() !== "nothing")
    // An id is letters then digits: E1, WS2, DOC1, TH7, I10, REL1.
    .filter((s) => /^[A-Z]{1,4}\d+$/.test(s));
}

function allMatches(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) out.push(...idsFrom(m[1]));
  return [...new Set(out)];
}

const tickets = parse();
const byId = new Map(tickets.map((t) => [t.id, t]));
const problems = [];
const notes = [];

for (const t of tickets) {
  t.blockedBy = allMatches(t.body, BLOCKED_BY);
  t.blocks = allMatches(t.body, BLOCKS);
}

// 1. Duplicate ids.
const seen = new Set();
for (const t of tickets) {
  if (seen.has(t.id)) problems.push(`line ${t.line}: duplicate ticket id ${t.id}`);
  seen.add(t.id);
}

// 2. Dangling blocker references.
for (const t of tickets) {
  for (const dep of t.blockedBy) {
    if (!byId.has(dep)) {
      problems.push(`line ${t.line}: ${t.id} is blocked by ${dep}, which does not exist`);
    }
  }
  if (t.blockedBy.includes(t.id)) {
    problems.push(`line ${t.line}: ${t.id} blocks itself`);
  }
}

// 3. Unreciprocated "Blocks X": X must name this ticket back.
for (const t of tickets) {
  for (const target of t.blocks) {
    const other = byId.get(target);
    if (!other) {
      problems.push(`line ${t.line}: ${t.id} claims to block ${target}, which does not exist`);
    } else if (!other.blockedBy.includes(t.id)) {
      problems.push(
        `line ${t.line}: ${t.id} claims "Blocks ${target}" but ${target} (line ${other.line}) does not name ${t.id} back`,
      );
    }
  }
}

// 4. Cycles.
const WHITE = 0, GREY = 1, BLACK = 2;
const colour = new Map(tickets.map((t) => [t.id, WHITE]));
const stack = [];
function visit(id) {
  const t = byId.get(id);
  if (!t) return;
  colour.set(id, GREY);
  stack.push(id);
  for (const dep of t.blockedBy) {
    if (!byId.has(dep)) continue;
    if (colour.get(dep) === GREY) {
      const at = stack.indexOf(dep);
      problems.push(`cycle: ${[...stack.slice(at), dep].join(" -> ")}`);
    } else if (colour.get(dep) === WHITE) {
      visit(dep);
    }
  }
  stack.pop();
  colour.set(id, BLACK);
}
for (const t of tickets) if (colour.get(t.id) === WHITE) visit(t.id);

// 5. Acceptance deadlock: T is blocked by B, and B's own criteria name T.
//    B cannot be accepted until T exists, and T cannot start until B is done.
//    This exact shape shipped once (I7 <-> E6) and two reviews were needed to
//    catch it, so it is a first-class check.
for (const t of tickets) {
  for (const dep of t.blockedBy) {
    const b = byId.get(dep);
    if (!b) continue;
    const re = new RegExp(`\\b${t.id}\\b`);
    const hit = b.criteria.find((c) => re.test(c));
    if (hit) {
      problems.push(
        `deadlock: ${t.id} (line ${t.line}) is blocked by ${dep}, but ${dep}'s criterion refers to ${t.id}: "${hit.slice(0, 90)}"`,
      );
    }
  }
}

// 5b. Acceptance inversion: a criterion names a ticket that is NOT an ancestor.
//     The mirror image of the deadlock check, and where the remaining real
//     defects hide — V3 requiring E6, V8 requiring T2, G1 requiring I1. A
//     ticket cannot be accepted against work it never declared it needed.
//     Run after the closure helper is defined, below.

// 6. Transitive closure per ticket, and which phases each phase reaches.
//    A claim like "Phase 0 does not wait on the migration" is checkable, not
//    a matter of opinion.
const closureCache = new Map();
function closure(id) {
  if (closureCache.has(id)) return closureCache.get(id);
  const out = new Set();
  closureCache.set(id, out); // cycle-safe: partial result is fine here
  for (const dep of byId.get(id)?.blockedBy ?? []) {
    if (!byId.has(dep)) continue;
    out.add(dep);
    for (const x of closure(dep)) out.add(x);
  }
  return out;
}

// 5b. Acceptance inversion: a criterion names a ticket that is NOT an ancestor.
//     The mirror image of the deadlock check, and where the remaining real
//     defects hide. A ticket cannot be accepted against work it never declared
//     it needed, because nothing schedules that work first.
for (const t of tickets) {
  const deps = closure(t.id);
  for (const other of tickets) {
    if (other.id === t.id || deps.has(other.id)) continue;
    const re = new RegExp(`\\b${other.id}\\b`);
    const hit = t.criteria.find((c) => re.test(c));
    if (hit) {
      problems.push(
        `inversion: ${t.id} (line ${t.line}) has a criterion naming ${other.id}, which is not among its blockers: "${hit.slice(0, 80)}"`,
      );
    }
  }
}

const phases = [...new Set(tickets.map((t) => t.phase))].sort((a, b) => a - b);
for (const p of phases) {
  const reached = new Set();
  for (const t of tickets.filter((x) => x.phase === p)) {
    for (const dep of closure(t.id)) reached.add(byId.get(dep).phase);
  }
  reached.delete(p);
  const list = [...reached].sort((a, b) => a - b);
  notes.push(`phase ${p} reaches ${list.length ? "phases " + list.join(", ") : "no other phase"}`);
}

// 7. Unblocked roots and orphans, so it is obvious what can start now.
const roots = tickets.filter((t) => t.blockedBy.length === 0);
notes.push(`startable now (no blockers): ${roots.map((t) => t.id).join(", ") || "none"}`);

// 8. Every ticket must carry at least one criterion.
for (const t of tickets) {
  if (t.criteria.length === 0) {
    problems.push(`line ${t.line}: ${t.id} has no criteria`);
  }
}

console.log(`${path}: ${tickets.length} tickets, ${phases.length} phases`);
for (const n of notes) console.log(`  ${n}`);
if (problems.length === 0) {
  console.log("plan check: OK");
  process.exit(0);
}
console.error(`\nplan check FAILED with ${problems.length} problem(s):`);
for (const p of problems) console.error(`  ${p}`);
process.exit(1);
