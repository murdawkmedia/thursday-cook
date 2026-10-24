#!/usr/bin/env bun
/**
 * Generate Thursday verb skills.
 *
 * A skill is one verb, named exactly the verb, so a harness that intercepts
 * slash commands resolves it instead of swallowing it.
 *
 *     /thlog  ->  .agents/skills/thlog/SKILL.md
 *
 * The skill layer is generated from the verb table in the root skill. The
 * procedure layer is separate: a verb may point at a procedure, and a procedure
 * may have no verb at all. Skills hold no content — the verb table holds the
 * meaning and the procedure holds the detail, so neither can drift from the
 * other.
 *
 * The root skill itself is not generated. It is edited in place at
 * `.agents/skills/thursday/SKILL.md` and copied out when `--out` differs.
 *
 * Usage:
 *     bun run scripts/gen-th-skills.ts
 *     bun run scripts/gen-th-skills.ts thlog
 *     bun run scripts/gen-th-skills.ts --dry-run
 *     bun run scripts/gen-th-skills.ts --out ~/.commandcode/skills
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PROC_DIR = join(ROOT, "procedures");
const ROOT_SKILL = join(ROOT, ".agents", "skills", "thursday", "SKILL.md");
const DEFAULT_OUT = join(ROOT, ".agents", "skills");
const ROOT_SKILL_NAME = "thursday";

const SKIP = new Set(["template.md"]);
const NUMERIC = /^\d{3}-/;
const USER = /^user-/;

// Every generated skill carries this line, so the pruner only ever removes
// files this script wrote.
const MARKER = "Load the Thursday root skill";
const LEGACY_MARKER = "Load the Thursday skill file";

const CONFIG_PATHS = [
  "  - Linux · `~/.local/share/thursday/thursday.toml`",
  "  - macOS · `~/Library/Application Support/thursday/thursday.toml`",
  "  - Windows · `%LOCALAPPDATA%\\thursday\\thursday.toml`",
];

function wrap(text: string, width = 84) {
  const out: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }

  if (line) out.push(line);
  return out;
}

type Proc = {
  file: string;
  desc: string;
  verbs: string[];
};

type Verb = {
  verb: string;
  means: string;
  effect: string;
  procedure?: Proc;
};

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseFrontmatter(text: string) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { fm: [], body: text };

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { fm: [], body: text };

  return { fm: lines.slice(1, end), body: lines.slice(end + 1).join("\n") };
}

function readField(fm: string[], key: string) {
  const line = fm.find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim();
}

function readVerbs(fm: string[]) {
  const raw = readField(fm, "verb");
  if (!raw) return [];
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function readDesc(fm: string[]) {
  const inline = readField(fm, "desc");
  if (inline) return inline;

  const start = fm.findIndex((l) => l.startsWith("thursday-note:"));
  if (start === -1) return "";

  for (const line of fm.slice(start + 1)) {
    const m = line.match(/^\s+desc:\s*(.+)$/);
    if (m) return m[1].trim();
    if (!/^\s/.test(line)) break;
  }

  return "";
}

async function listProcedures(dir: string): Promise<Proc[]> {
  const out: Proc[] = [];

  for (const entry of (await readdir(dir)).sort()) {
    if (!entry.endsWith(".md")) continue;
    if (SKIP.has(entry)) continue;
    if (USER.test(entry)) continue;
    if (!NUMERIC.test(entry)) continue;

    const path = join(dir, entry);
    const { fm } = parseFrontmatter(await readFile(path, "utf8"));

    out.push({ file: path, desc: readDesc(fm), verbs: readVerbs(fm) });
  }

  return out;
}

/** Rows in the root skill's verb table: | `/thlog` | capture | ... | */
function parseVerbTable(text: string): Verb[] {
  const verbs: Verb[] = [];

  for (const line of text.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;

    const verb = cells[1].replace(/`/g, "").trim();
    if (!verb.startsWith("/th")) continue;

    verbs.push({ verb, means: cells[2], effect: cells[3] });
  }

  return verbs;
}

function skillName(verb: string) {
  return verb.replace(/^\//, "");
}

function body(verb: Verb) {
  const lines = [
    ...wrap(
      `${MARKER} if it is not already loaded this session or since the last compaction.`,
    ),
    "",
    ...wrap(`\`${verb.verb}\` means **${verb.means}**: ${verb.effect}`),
  ];

  const source = verb.procedure
    ? `procedures/${basename(verb.procedure.file)}`
    : undefined;

  if (source) {
    const file = basename(verb.procedure.file);
    lines.push(
      "",
      ...wrap(
        `Then read \`<personal>/procedures/${file}\` and follow it. The user's personal dir comes first, always. Only if they have not set up a Thursday dir, or that file is not there, read the shipped copy at \`<install.repo>/${source}\`.`,
      ),
      "",
      ...wrap(
        "Resolve `[personal].procedures` and `install.repo` from the `[personal]` and `[install]` tables in the Thursday config:",
      ),
      "",
      ...CONFIG_PATHS,
      "",
      ...wrap("Do not guess either path. Never write to the checkout."),
    );
  } else {
    lines.push(
      "",
      ...wrap(
        "The root skill carries the rule for this one. Follow it there.",
      ),
    );
  }

  return lines.join("\n") + "\n";
}

function frontmatter(verb: Verb) {
  const firstClause = verb.effect.split(/\.\s|\.$/)[0];
  const description = `${verb.verb} · ${verb.means} — ${firstClause}`
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .trim();

  const safe =
    description.length > 140
      ? `${description.slice(0, 137).trimEnd()}...`
      : description;

  return `---\nname: ${skillName(verb.verb)}\ndescription: "${safe}"\n---\n\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");

  const outIdx = args.indexOf("--out");
  const outDir =
    outIdx !== -1 && args[outIdx + 1]
      ? resolve(args[outIdx + 1].replace(/^~/, homedir()))
      : DEFAULT_OUT;

  const wanted = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1);

  if (!(await exists(PROC_DIR))) {
    console.error(`no procedures directory at ${PROC_DIR}`);
    process.exit(1);
  }

  if (!(await exists(ROOT_SKILL))) {
    console.error(`no root skill at ${ROOT_SKILL}`);
    process.exit(1);
  }

  const procs = await listProcedures(PROC_DIR);
  const byVerb = new Map<string, Proc>();
  for (const proc of procs) {
    for (const verb of proc.verbs) byVerb.set(verb, proc);
  }

  const all = parseVerbTable(await readFile(ROOT_SKILL, "utf8"));
  if (!all.length) {
    console.error("no verbs found in the root skill's verb table");
    process.exit(1);
  }

  const verbs = wanted.length
    ? all.filter((v) => wanted.some((w) => v.verb.includes(w) || skillName(v.verb) === w))
    : all;

  if (!verbs.length) {
    console.error("no verbs matched");
    process.exit(1);
  }

  for (const v of verbs) v.procedure = byVerb.get(v.verb);

  const wantedNames = new Set(verbs.map((v) => skillName(v.verb)));
  let written = 0;

  for (const verb of verbs) {
    const name = skillName(verb.verb);
    const dest = join(outDir, name, "SKILL.md");
    const content = frontmatter(verb) + body(verb);

    if (dry) {
      console.log(`\n===== ${relative(ROOT, dest)} =====\n${content}`);
      written++;
      continue;
    }

    await mkdir(join(outDir, name), { recursive: true });
    await writeFile(dest, content, "utf8");
    console.log(`wrote ${relative(ROOT, dest)}`);
    written++;
  }

  // The root skill is a real skill, not a verb stub: it has a body, and it is
  // edited in place at its canonical location. Copy it to a different output
  // dir when one is given, so `--out` installs get it too.
  if (!wanted.length) {
    const rootDest = join(outDir, ROOT_SKILL_NAME, "SKILL.md");

    if (resolve(ROOT_SKILL) === resolve(rootDest)) {
      console.log(`kept ${relative(ROOT, rootDest)}`);
    } else if (dry) {
      console.log(
        `\n===== ${relative(ROOT, rootDest)} =====\n${await readFile(ROOT_SKILL, "utf8")}`,
      );
    } else {
      await mkdir(join(outDir, ROOT_SKILL_NAME), { recursive: true });
      await writeFile(rootDest, await readFile(ROOT_SKILL, "utf8"), "utf8");
      console.log(`wrote ${relative(ROOT, rootDest)}`);
    }
    written++;
  }

  // prune skills this script wrote that no longer have a verb
  if (!dry && !wanted.length && (await exists(outDir))) {
    for (const entry of await readdir(outDir)) {
      if (entry === ROOT_SKILL_NAME) continue;
      if (wantedNames.has(entry)) continue;

      const target = join(outDir, entry);
      const skill = join(target, "SKILL.md");
      if (!(await exists(skill))) continue;

      const text = await readFile(skill, "utf8");
      if (!text.includes(MARKER) && !text.includes(LEGACY_MARKER)) continue;

      await rm(target, { recursive: true, force: true });
      console.log(`pruned ${relative(ROOT, target)}`);
    }
  }

  console.log(
    `\n${written} skill(s) ${dry ? "previewed" : "written"} -> ${relative(ROOT, outDir) || outDir}`,
  );
}

await main();
