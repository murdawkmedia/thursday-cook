#!/usr/bin/env bun
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

const fallback = process.env.IDEA_FINDER_FILE ?? "";
const answer = (await ask(`which file?${fallback ? ` [${fallback}]` : ""} `)).trim();
rl.close();

const path = answer || fallback;
if (!path) {
  console.error("no file given — type one, or set IDEA_FINDER_FILE in .env");
  process.exit(1);
}

let text: string;
try {
  text = await Bun.file(path).text();
} catch {
  console.error(`cannot read ${path}`);
  process.exit(1);
}

const isItem = (line: string) => /^(\s*)- (.*)$/.exec(line);
const items = text.split("\n");

// an "idea" is a leaf: a list item with no item nested beneath it.
const ideas: { line: number; text: string }[] = [];
for (let i = 0; i < items.length; i++) {
  const me = isItem(items[i]);
  if (!me) continue;
  let hasChild = false;
  for (let j = i + 1; j < items.length; j++) {
    const next = isItem(items[j]);
    if (!next) continue;
    if (next[1].length > me[1].length) hasChild = true;
    break;
  }
  if (!hasChild) ideas.push({ line: i + 1, text: me[2].trim() });
}

console.log(`\n${path} — ${ideas.length} ideas (leaves, nothing built on them yet)\n`);
for (const idea of ideas) console.log(`  ${path}:${idea.line}  ${idea.text}`);
console.log();
