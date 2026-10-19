#!/usr/bin/env bun
/**
 * Generate th-* pointer skills from Thursday procedures.
 *
 * A procedure lives at:
 *     procedures/000-th-how-to-talk.md
 *
 * A skill is a pointer, generated at:
 *     .agents/skills/th-how-to-talk/SKILL.md
 *
 * Skills hold no content. They are three lines that resolve a verb to a
 * procedure. The procedure is the only copy, so a skill cannot drift.
 *
 * Naming rule: the procedure filename carries the number and the `th-` prefix.
 * `000-th-how-to-talk.md` -> strip `^\d{3}-` -> `th-how-to-talk`.
 *
 * Usage:
 *     bun run scripts/gen-th-skills.ts
 *     bun run scripts/gen-th-skills.ts 000-th-how-to-talk
 *     bun run scripts/gen-th-skills.ts --dry-run
 *     bun run scripts/gen-th-skills.ts --out ~/.commandcode/skills
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PROC_DIR = join(ROOT, "procedures");
const DEFAULT_OUT = join(ROOT, ".agents", "skills");

const SKIP = new Set(["template.md"]);
const NUMERIC = /^\d{3}-/;
const USER = /^user-/;

type Proc = {
  file: string;
  slug: string;
  title: string;
  verbs: string[];
  desc: string;
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
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "");
  return inner
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

function titleOf(body: string) {
  for (const line of body.split("\n")) {
    const m = line.match(/^Concept:\s*(.+)$/);
    if (m) return m[1].trim();
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
    const text = await readFile(path, "utf8");
    const { fm, body } = parseFrontmatter(text);
    const slug = basename(entry, ".md").replace(NUMERIC, "");

    if (!slug.startsWith("th-")) {
      console.warn(`warn  ${entry} does not start with th- after the number`);
    }

    out.push({
      file: path,
      slug,
      title: titleOf(body),
      verbs: readVerbs(fm),
      desc: readDesc(fm),
    });
  }

  return out;
}

function pointer(proc: Proc, sourcePath: string) {
  const description =
    proc.desc || proc.title || `Thursday procedure: ${proc.slug}`;
  const verbLine = proc.verbs.length ? ` · ${proc.verbs.join(" ")}` : "";
  const oneLine = `${description}${verbLine}`.replace(/\s+/g, " ").trim();

  return `---
name: ${proc.slug}
description: ${oneLine}
---

Load the Thursday skill file if it is not loaded this session or since the last
compaction.

Then read \`<install.repo>/${sourcePath}\` and follow it. Resolve \`install.repo\`
from the \`[install]\` table in the Thursday config — \`~/.config/thursday/thursday.toml\`
on Linux, \`~/Library/Application Support/thursday/thursday.toml\` on macOS,
\`%APPDATA%\\thursday\\thursday.toml\` on Windows. Do not guess the path.
`;
}

function sourcePathFor(proc: Proc) {
  return `procedures/${basename(proc.file)}`;
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

  const proceduresDir = join(ROOT, "procedures");

  if (!(await exists(proceduresDir))) {
    console.error(`no procedures directory at ${proceduresDir}`);
    process.exit(1);
  }

  let procs = await listProcedures(proceduresDir);

  if (wanted.length) {
    procs = procs.filter((p) =>
      wanted.some((w) => basename(p.file).startsWith(w) || p.slug === w),
    );
  }

  if (!procs.length) {
    console.error("no procedures matched");
    process.exit(1);
  }

  // generated skills we own: th-* dirs only
  const wantedSlugs = new Set(procs.map((p) => p.slug));

  let written = 0;
  for (const proc of procs) {
    const source = sourcePathFor(proc);
    const body = pointer(proc, source);
    const dest = join(outDir, proc.slug, "SKILL.md");

    if (dry) {
      console.log(`\n===== ${relative(ROOT, dest)} =====\n${body}`);
      written++;
      continue;
    }

    await mkdir(join(outDir, proc.slug), { recursive: true });
    await writeFile(dest, body, "utf8");
    console.log(`wrote ${relative(ROOT, dest)}`);
    written++;
  }

  // The root skill is a real skill, not a pointer: it has a body, and it is
  // edited in place at its canonical location. Copy it to a different output
  // dir when one is given, so `--out` installs get it too.
  const rootSkill = join(ROOT, ".agents", "skills", "thursday", "SKILL.md");
  const rootDest = join(outDir, "thursday", "SKILL.md");

  if ((await exists(rootSkill)) && !wanted.length) {
    if (resolve(rootSkill) === resolve(rootDest)) {
      console.log(`kept ${relative(ROOT, rootDest)}`);
    } else if (dry) {
      console.log(`\n===== ${relative(ROOT, rootDest)} =====\n${await readFile(rootSkill, "utf8")}`);
    } else {
      await mkdir(join(outDir, "thursday"), { recursive: true });
      await writeFile(rootDest, await readFile(rootSkill, "utf8"), "utf8");
      console.log(`wrote ${relative(ROOT, rootDest)}`);
    }
    written++;
  } else if (!(await exists(rootSkill))) {
    console.warn(`warn  no root skill at ${relative(ROOT, rootSkill)}`);
  }

  // prune pointers whose procedure disappeared
  if (!dry && !wanted.length && (await exists(outDir))) {
    for (const entry of await readdir(outDir)) {
      if (!entry.startsWith("th-")) continue;
      if (wantedSlugs.has(entry)) continue;

      const target = join(outDir, entry);
      const skill = join(target, "SKILL.md");
      if (!(await exists(skill))) continue;

      const text = await readFile(skill, "utf8");
      // only touch pointers we generated: they carry the marker line
      if (!text.includes("Load the Thursday skill file")) continue;

      await rm(target, { recursive: true, force: true });
      console.log(`pruned ${relative(ROOT, target)}`);
    }
  }

  console.log(
    `\n${written} skill(s) ${dry ? "previewed" : "written"} -> ${relative(ROOT, outDir) || outDir}`,
  );
}

await main();
