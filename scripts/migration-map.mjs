#!/usr/bin/env node
/**
 * migration-map.mjs — validate config/migration-map.json against both source
 * repositories and generate docs/MIGRATION-MAP.md from it.
 *
 * THIS SCRIPT IS REPORT-ONLY. It never moves, copies, deletes or creates any
 * migrated file. The single file it writes is docs/MIGRATION-MAP.md, which is
 * generated output. Everything else it does is read: JSON.parse and
 * `git ls-files` in each source repository. The source repositories are opened
 * read-only and are never written to.
 *
 * Usage:
 *   node scripts/migration-map.mjs            validate, then write the doc
 *   node scripts/migration-map.mjs --check    validate, fail if the doc is stale
 *   node scripts/migration-map.mjs --strict   also fail on rules matching no file
 *   node scripts/migration-map.mjs --fake <repo>:<path>[,<repo>:<path>...]
 *                                             inject phantom upstream paths to
 *                                             prove an unmatched file is an
 *                                             error, without touching any repo
 *
 * Exit 0 when the map is valid (and, under --check, the doc is current).
 * Exit 1 on any validation error. Exit 2 on a usage or environment failure.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MAP_PATH = join(ROOT, "config", "migration-map.json");
const DOC_PATH = join(ROOT, "docs", "MIGRATION-MAP.md");
const DOC_REL = "docs/MIGRATION-MAP.md";
const MAP_REL = "config/migration-map.json";

const VERDICTS = new Set(["move", "stay", "drop"]);

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const opts = { check: false, strict: false, fakes: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--check") opts.check = true;
  else if (a === "--strict") opts.strict = true;
  else if (a === "--fake") {
    const spec = argv[++i];
    if (!spec) fail(2, "--fake needs <repo>:<path>[,<repo>:<path>...]");
    for (const one of spec.split(",")) {
      const idx = one.indexOf(":");
      if (idx < 1) fail(2, `bad --fake value: ${one} (want <repo>:<path>)`);
      opts.fakes.push({ repo: one.slice(0, idx), path: one.slice(idx + 1) });
    }
  } else if (a === "--help" || a === "-h") {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 25).join("\n"));
    process.exit(0);
  } else fail(2, `unknown argument: ${a}`);
}

function fail(code, msg) {
  console.error(`migration-map: ${msg}`);
  process.exit(code);
}

// ------------------------------------------------------------ glob matching

/** Expand every {a,b} alternation, including empty branches, into plain globs. */
function expandBraces(pattern) {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`unbalanced { in pattern: ${pattern}`);
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const body = pattern.slice(open + 1, close);
  const branches = [];
  let depth2 = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "{") depth2++;
    if (ch === "}") depth2--;
    if (ch === "," && depth2 === 0) {
      branches.push(cur);
      cur = "";
    } else cur += ch;
  }
  branches.push(cur);
  return branches.flatMap((b) => expandBraces(head + b + tail));
}

/** Compile one brace-free glob to an anchored RegExp. */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else out += "[^/]*";
    } else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function compile(pattern) {
  return expandBraces(pattern).map(globToRegExp);
}

function matchesAny(regexps, path) {
  return regexps.some((re) => re.test(path));
}

// ------------------------------------------------------------------- inputs

if (!existsSync(MAP_PATH)) fail(2, `missing ${MAP_REL}`);
let map;
try {
  map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
} catch (e) {
  fail(2, `${MAP_REL} is not valid JSON: ${e.message}`);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ------------------------------------------------------- schema validation

if (!Array.isArray(map.rules) || map.rules.length === 0) fail(2, "map has no rules");
if (!map.repos || typeof map.repos !== "object") fail(2, "map has no repos");
if (!map.thursday || !Array.isArray(map.thursday.roots)) fail(2, "map has no thursday.roots");

const repoNames = Object.keys(map.repos);
const allowedRoots = map.thursday.roots;
const allowedPackages = new Set(map.thursday.packages ?? []);

function destinationIsInsideThursday(dest) {
  if (dest === "./") return true;
  const root = allowedRoots.find((r) => r !== "./" && dest.startsWith(r));
  if (!root) return false;
  if (root === "packages/") {
    const pkg = dest.slice("packages/".length).split("/")[0];
    if (!allowedPackages.has(pkg)) return false;
  }
  return dest.endsWith("/");
}

const seenIds = new Set();
const compiled = [];
for (const rule of map.rules) {
  const at = `rule ${rule.id ?? "(no id)"}`;
  if (!rule.id) err(`${at}: missing id`);
  else if (seenIds.has(rule.id)) err(`${at}: duplicate id`);
  else seenIds.add(rule.id);

  if (!repoNames.includes(rule.repo)) err(`${at}: unknown repo ${JSON.stringify(rule.repo)}`);
  if (typeof rule.pattern !== "string" || rule.pattern === "") err(`${at}: missing pattern`);
  if (!VERDICTS.has(rule.verdict)) err(`${at}: verdict must be move|stay|drop, got ${JSON.stringify(rule.verdict)}`);
  if (typeof rule.reason !== "string" || rule.reason.trim().length < 10) err(`${at}: reason is missing or too short`);

  if (rule.verdict === "move") {
    if (typeof rule.destination !== "string" || rule.destination === "") {
      err(`${at}: verdict 'move' requires a destination`);
    } else if (!destinationIsInsideThursday(rule.destination)) {
      err(`${at}: destination ${JSON.stringify(rule.destination)} does not land inside Thursday's structure`);
    }
  } else if (rule.destination) {
    err(`${at}: verdict '${rule.verdict}' must not carry a destination`);
  }

  if (rule.except !== undefined && !Array.isArray(rule.except)) err(`${at}: except must be an array`);
  if (rule.partial) {
    for (const k of ["generalPart", "destination", "note"]) {
      if (!rule.partial[k]) err(`${at}: partial.${k} is missing`);
    }
  }

  try {
    compiled.push({
      rule,
      include: compile(rule.pattern ?? ""),
      exclude: (rule.except ?? []).flatMap((p) => compile(p)),
    });
  } catch (e) {
    err(`${at}: ${e.message}`);
  }
}

if (errors.length) {
  console.error("SCHEMA ERRORS");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

function ruleMatches(entry, path) {
  if (!matchesAny(entry.include, path)) return false;
  if (entry.exclude.length && matchesAny(entry.exclude, path)) return false;
  return true;
}

// ------------------------------------------------- enumerate the source repos

function trackedFiles(repoPath) {
  const out = execFileSync("git", ["-C", repoPath, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

const inventory = new Map(); // repo -> string[]
for (const [name, info] of Object.entries(map.repos)) {
  if (!existsSync(info.path)) fail(2, `source repo ${name} not found at ${info.path}`);
  let files;
  try {
    files = trackedFiles(info.path);
  } catch (e) {
    fail(2, `git ls-files failed in ${info.path}: ${e.message}`);
  }
  inventory.set(name, files);
}

const phantom = new Set();
for (const f of opts.fakes) {
  if (!inventory.has(f.repo)) fail(2, `--fake names unknown repo ${f.repo}`);
  inventory.get(f.repo).push(f.path);
  inventory.set(f.repo, inventory.get(f.repo).slice().sort());
  phantom.add(`${f.repo}:${f.path}`);
}

// --------------------------------------------------------------- coverage

const unmatched = [];
const doubled = [];
const hits = new Map(); // rule id -> string[] of "repo:path"
for (const c of compiled) hits.set(c.rule.id, []);
const assignment = new Map(); // "repo:path" -> rule

for (const [repo, files] of inventory) {
  for (const path of files) {
    const matched = compiled.filter((c) => c.rule.repo === repo && ruleMatches(c, path));
    if (matched.length === 0) {
      unmatched.push(`${repo}:${path}`);
    } else if (matched.length > 1) {
      doubled.push(`${repo}:${path}  <-  ${matched.map((m) => m.rule.id).join(", ")}`);
    } else {
      hits.get(matched[0].rule.id).push(`${repo}:${path}`);
      assignment.set(`${repo}:${path}`, matched[0].rule);
    }
  }
}

const deadRules = compiled.filter((c) => hits.get(c.rule.id).length === 0).map((c) => c.rule.id);

// --------------------------------------------------------- unit coverage

/** Skill units, taken from the rule patterns (skills/<name>/**). */
function unitsFrom(prefix) {
  const units = new Map(); // name -> rules[]
  for (const c of compiled) {
    const m = c.rule.pattern.match(new RegExp(`^${prefix}/([^/*{]+)/`));
    if (!m) continue;
    const key = `${c.rule.repo}/${m[1]}`;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(c.rule);
  }
  return units;
}

const skillUnits = unitsFrom("skills");
const pluginDirUnits = unitsFrom("plugins");

/** Plugin units also include the single-file host plugins, keyed by destination. */
const pluginUnits = new Map(pluginDirUnits);
for (const c of compiled) {
  const r = c.rule;
  if (r.repo !== "dotfiles-ai") continue;
  if (!/^plugins\/[^/]+$/.test(r.pattern.replace(/\{[^}]*\}/g, "X"))) continue;
  if (r.pattern.includes("/") === false) continue;
  const rest = r.pattern.slice("plugins/".length);
  if (rest.includes("/")) continue;
  let key;
  if (r.verdict === "move" && r.destination.startsWith("packages/plugins/")) {
    key = `dotfiles-ai/${r.destination.slice("packages/plugins/".length).replace(/\/$/, "")}`;
  } else {
    key = `dotfiles-ai/(${r.verdict}) ${r.pattern}`;
  }
  if (!pluginUnits.has(key)) pluginUnits.set(key, []);
  if (!pluginUnits.get(key).includes(r)) pluginUnits.get(key).push(r);
}

for (const [name, rules] of skillUnits) {
  const verdicts = new Set(rules.map((r) => r.verdict));
  if (verdicts.size > 1) err(`skill ${name} has conflicting verdicts: ${[...verdicts].join(", ")}`);
}

/** Ground truth: every directory that actually exists under skills/ and plugins/. */
function actualDirs(repo, prefix) {
  const set = new Set();
  for (const p of inventory.get(repo) ?? []) {
    if (!p.startsWith(`${prefix}/`)) continue;
    const rest = p.slice(prefix.length + 1);
    const slash = rest.indexOf("/");
    if (slash > 0) set.add(rest.slice(0, slash));
  }
  return set;
}

for (const repo of repoNames) {
  for (const d of actualDirs(repo, "skills")) {
    if (!skillUnits.has(`${repo}/${d}`)) err(`${repo}: skills/${d} exists upstream but has no rule of its own`);
  }
  for (const d of actualDirs(repo, "plugins")) {
    if (!pluginDirUnits.has(`${repo}/${d}`)) err(`${repo}: plugins/${d} exists upstream but has no rule of its own`);
  }
}

// -------------------------------------------------------------- doc output

function esc(s) {
  return String(s).replace(/\|/g, "\\|");
}

function verdictCell(rule) {
  if (rule.verdict === "move") return `**move** → \`${esc(rule.destination)}\``;
  if (rule.verdict === "stay") return "**stay**";
  return "**drop**";
}

function rulesTable(repo) {
  const rows = map.rules.filter((r) => r.repo === repo);
  const lines = [
    "| Source pattern | Verdict | Reason |",
    "| --- | --- | --- |",
  ];
  for (const r of rows) {
    const pat = "`" + esc(r.pattern) + "`" + (r.except ? `<br>_except_ ${r.except.map((e) => "`" + esc(e) + "`").join(", ")}` : "");
    let reason = esc(r.reason);
    if (r.partial) {
      reason += `<br>**Partial:** ${esc(r.partial.generalPart)} → \`${esc(r.partial.destination)}\`. ${esc(r.partial.note)}`;
    }
    lines.push(`| ${pat} | ${verdictCell(r)} | ${reason} |`);
  }
  return lines.join("\n");
}

function unitTable(units, label) {
  const lines = [`| ${label} | Verdict | Destination |`, "| --- | --- | --- |"];
  for (const key of [...units.keys()].sort()) {
    const rules = units.get(key);
    const primary = rules.find((r) => r.verdict === "move") ?? rules[0];
    const name = key.replace(/^[^/]+\//, "");
    const dest = primary.verdict === "move" ? "`" + esc(primary.destination) + "`" : "—";
    lines.push(`| \`${esc(name)}\` | **${primary.verdict}** | ${dest} |`);
  }
  return lines.join("\n");
}

function counts(repo) {
  const rows = map.rules.filter((r) => r.repo === repo);
  const c = { move: 0, stay: 0, drop: 0 };
  for (const r of rows) c[r.verdict]++;
  return c;
}

function renderDoc() {
  const out = [];
  out.push("# Thursday migration map");
  out.push("");
  out.push("<!--");
  out.push("  GENERATED FILE — DO NOT HAND-EDIT.");
  out.push("");
  out.push(`  Generated from ${MAP_REL} by scripts/migration-map.mjs.`);
  out.push("  Every edit belongs in the JSON map. Regenerate with:");
  out.push("");
  out.push("      node scripts/migration-map.mjs");
  out.push("");
  out.push("  Any hand-edit is destroyed by the next run, and");
  out.push("  `node scripts/migration-map.mjs --check` fails while one is present.");
  out.push("-->");
  out.push("");
  out.push("> **This file is generated. Do not hand-edit it.**");
  out.push("> The source of truth is [`" + MAP_REL + "`](../" + MAP_REL + ").");
  out.push("> Change a rule there and run `node scripts/migration-map.mjs`.");
  out.push("");
  out.push("This document is derived from the map alone, so it is byte-identical on every");
  out.push("run against an unchanged map. Live validation against the source repositories");
  out.push("is printed by the script; it is deliberately not baked into this file, which");
  out.push("would make the doc churn every time upstream moved.");
  out.push("");

  out.push("## Why JSON and not YAML");
  out.push("");
  for (const line of map.$comment ?? []) {
    if (line === "") out.push("");
    else out.push(line);
  }
  out.push("");

  out.push("## How to read a rule");
  out.push("");
  out.push("Patterns are repo-relative and anchored at both ends:");
  out.push("");
  for (const [k, v] of Object.entries(map.patternSyntax ?? {})) {
    out.push(`- \`${esc(k)}\` — ${esc(v)}`);
  }
  out.push("");
  out.push("Destinations:");
  out.push("");
  for (const [k, v] of Object.entries(map.destinationSyntax ?? {})) {
    out.push(`- \`${esc(k)}\` — ${esc(v)}`);
  }
  out.push("");
  out.push("Verdicts:");
  out.push("");
  out.push("- **move** — the file becomes part of Thursday at the named destination.");
  out.push("- **stay** — the file remains in its source repository and is not Thursday's.");
  out.push("- **drop** — the file is carried over by nobody: build output, a lockfile,");
  out.push("  expired notes, or a test whose subject stops existing.");
  out.push("");

  out.push("## The boundary at a glance");
  out.push("");
  out.push("| Repository | Rules | move | stay | drop |");
  out.push("| --- | --- | --- | --- | --- |");
  let total = 0;
  for (const repo of repoNames) {
    const c = counts(repo);
    const n = c.move + c.stay + c.drop;
    total += n;
    out.push(`| \`${esc(repo)}\` | ${n} | ${c.move} | ${c.stay} | ${c.drop} |`);
  }
  out.push(`| **total** | **${total}** | | | |`);
  out.push("");
  for (const [name, info] of Object.entries(map.repos)) {
    out.push(`- \`${esc(name)}\` (\`${esc(info.path)}\`) — ${esc(info.role)}`);
  }
  out.push("");

  out.push("## Skill verdicts");
  out.push("");
  out.push("Every skill directory carries its own rule, so a new skill added upstream");
  out.push("matches nothing and is reported as an error rather than absorbed by a wildcard.");
  out.push("");
  out.push(unitTable(new Map([...skillUnits].filter(([k]) => k.startsWith("dotfiles-ai/"))), "Skill"));
  out.push("");
  const aidosSkills = new Map([...skillUnits].filter(([k]) => k.startsWith("aidos/")));
  if (aidosSkills.size) {
    out.push("From `aidos`:");
    out.push("");
    out.push(unitTable(aidosSkills, "Skill"));
    out.push("");
  }

  out.push("## Plugin verdicts");
  out.push("");
  out.push("Every plugin — the single-file host plugins and the client packages alike —");
  out.push("carries its own rule and its own destination directory under");
  out.push("`packages/plugins/`.");
  out.push("");
  out.push(unitTable(pluginUnits, "Plugin"));
  out.push("");

  for (const repo of repoNames) {
    out.push(`## Rules — \`${esc(repo)}\``);
    out.push("");
    out.push(rulesTable(repo));
    out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const doc = renderDoc();

// ---------------------------------------------------------------- reporting

const lines = [];
lines.push("migration-map: validating config/migration-map.json");
lines.push("");
for (const [name, info] of Object.entries(map.repos)) {
  const files = inventory.get(name);
  const fakes = opts.fakes.filter((f) => f.repo === name).length;
  lines.push(
    `  repo ${name.padEnd(12)} ${String(files.length - fakes).padStart(4)} tracked files` +
      (fakes ? `  (+${fakes} injected phantom path${fakes > 1 ? "s" : ""})` : ""),
  );
}
lines.push(`  rules${" ".repeat(15)}${String(map.rules.length).padStart(4)}`);
lines.push("");

lines.push(`  skills with an explicit verdict: ${[...skillUnits.keys()].filter((k) => k.startsWith("dotfiles-ai/")).length} (dotfiles-ai), ${[...skillUnits.keys()].filter((k) => k.startsWith("aidos/")).length} (aidos)`);
lines.push(`  plugin units with an explicit verdict: ${pluginUnits.size}`);
lines.push("");

let matchedCount = 0;
for (const v of hits.values()) matchedCount += v.length;
let totalFiles = 0;
for (const v of inventory.values()) totalFiles += v.length;

lines.push(`  files matched by exactly one rule: ${matchedCount} / ${totalFiles}`);
for (const repo of repoNames) {
  const tally = { move: 0, stay: 0, drop: 0 };
  for (const [key, rule] of assignment) {
    if (key.startsWith(`${repo}:`)) tally[rule.verdict]++;
  }
  lines.push(
    `    ${repo.padEnd(12)} move ${String(tally.move).padStart(4)}   stay ${String(tally.stay).padStart(3)}   drop ${String(tally.drop).padStart(3)}`,
  );
}

if (unmatched.length) {
  lines.push("");
  lines.push(`  ERROR: ${unmatched.length} file(s) match NO rule:`);
  for (const p of unmatched.sort()) {
    lines.push(`    - ${p}${phantom.has(p) ? "   [injected phantom path]" : ""}`);
  }
  lines.push("");
  lines.push("  A file added upstream that matches no rule is an error, never a silent");
  lines.push("  pass-through. Add a rule to config/migration-map.json.");
  err(`${unmatched.length} unmatched file(s)`);
}

if (doubled.length) {
  lines.push("");
  lines.push(`  ERROR: ${doubled.length} file(s) match MORE THAN ONE rule:`);
  for (const p of doubled.sort()) lines.push(`    - ${p}`);
  err(`${doubled.length} doubly-matched file(s)`);
}

if (deadRules.length) {
  const msg = `${deadRules.length} rule(s) match no file: ${deadRules.join(", ")}`;
  if (opts.strict) err(msg);
  else warn(msg);
}

console.log(lines.join("\n"));

if (warnings.length) {
  console.log("");
  console.log("WARNINGS");
  for (const w of warnings) console.log(`  - ${w}`);
}

// --------------------------------------------------------------- doc write

const docCurrent = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : null;
if (opts.check) {
  console.log("");
  if (docCurrent === null) {
    console.log(`  ERROR: ${DOC_REL} does not exist; run without --check to generate it.`);
    err(`${DOC_REL} missing`);
  } else if (docCurrent !== doc) {
    console.log(`  ERROR: ${DOC_REL} is stale or hand-edited; run without --check to regenerate.`);
    err(`${DOC_REL} out of date`);
  } else {
    console.log(`  ${DOC_REL} is up to date (${doc.length} bytes).`);
  }
} else {
  const changed = docCurrent !== doc;
  writeFileSync(DOC_PATH, doc, "utf8");
  console.log("");
  console.log(`  ${changed ? "wrote" : "unchanged"} ${DOC_REL} (${doc.length} bytes)`);
}

console.log("");
if (errors.length) {
  console.log("RESULT: FAIL");
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("RESULT: OK");
process.exit(0);
