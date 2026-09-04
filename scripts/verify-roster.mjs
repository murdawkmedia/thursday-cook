// Proof script for ticket P5. Not part of the deliverable; run it to re-verify
// that config/plugin-roster.json still reproduces every spec sync.sh installs.
//
//   node config/verify-roster.mjs [path/to/sync.sh] [path/to/plugin-roster.json]
//
// Exits non-zero on any mismatch. Uses only plain node, no dependencies.
import fs from 'node:fs';

const shPath = process.argv[2] ?? '/home/sid/repos/dotfiles-ai/sync.sh';
const rosterPath = process.argv[3] ?? 'config/plugin-roster.json';

const sh = fs.readFileSync(shPath, 'utf8');
const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
let failures = 0;
const fail = (m) => { console.log('FAIL: ' + m); failures++; };

// 1. every install spec sync.sh runs -> exactly one roster spec
const specs = [...sh.matchAll(/^\t+pnpm_ins "([^"]+)"$/gm)].map((m) => m[1]);
specs.push(sh.match(/AIDOS_PLUGIN_SPEC="\$\{AIDOS_PLUGIN_SPEC:-([^}]+)\}"/)[1]);

const known = new Map();
for (const e of roster.entries) known.set(e.installSpec, `entries[${e.id}] -> ${e.packageName}`);
for (const p of roster.workspacePlugins.packages) known.set(p.installSpec, `workspacePlugins -> ${p.packageName}`);

console.log(`sync.sh install specs: ${specs.length}   roster specs: ${known.size}`);
for (const s of specs) {
  const hit = known.get(s);
  if (hit) console.log(`  ok  ${s}\n      ${hit}`);
  else fail(`sync.sh spec absent from roster: ${s}`);
}
for (const k of known.keys()) if (!specs.includes(k)) fail(`roster spec not in sync.sh: ${k}`);

// 2. the pin is carried verbatim inside the spec
for (const e of roster.entries) {
  if (e.origin === 'vendored') continue;
  if (!e.installSpec.includes(e.pin.value)) fail(`${e.id}: pin ${e.pin.value} is not in its installSpec`);
}

// 3. mandatory fields, known tier, known origin
const required = ['id', 'packageName', 'installSpec', 'origin', 'source', 'pin', 'plane',
  'why', 'allowBuilds', 'trust', 'lastReviewed', 'notes', 'hazards'];
for (const e of roster.entries) {
  for (const k of required) if (e[k] === undefined || e[k] === '') fail(`${e.id}: missing ${k}`);
  if (!['fetched', 'vendored'].includes(e.origin)) fail(`${e.id}: bad origin ${e.origin}`);
  if (!(e.trust.tier in roster.trustTiers)) fail(`${e.id}: unknown trust tier ${e.trust.tier}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.lastReviewed ?? '')) fail(`${e.id}: bad lastReviewed`);
  if (e.allowBuilds.required && !e.allowBuilds.key) fail(`${e.id}: allowBuilds required with no key`);
}

// 4. the derived expected set equals sync.sh's hand-written expected[] array
const expected = [...sh.split('local expected=(')[1].split(')')[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
const derived = [...roster.entries.map((e) => e.packageName),
  ...roster.workspacePlugins.packages.map((p) => p.packageName)].sort();
for (const n of expected) if (!derived.includes(n)) fail(`step_report_extra_plugins expects ${n}, roster does not produce it`);
for (const n of derived) if (!expected.includes(n)) fail(`roster produces ${n}, step_report_extra_plugins does not expect it`);

// 5. an excluded package must never appear as an installed entry
for (const x of roster.excluded.packages) {
  if (roster.entries.some((e) => e.packageName === x.packageName)) fail(`${x.packageName} is both excluded and installed`);
}

console.log(`\nentries=${roster.entries.length} workspacePlugins=${roster.workspacePlugins.packages.length} ` +
  `excluded=${roster.excluded.packages.length} candidates=${roster.candidates.packages.length}`);
console.log(failures === 0 ? 'ALL CHECKS PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
