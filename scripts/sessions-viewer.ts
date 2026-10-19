#!/usr/bin/env bun
/**
 * Browse Command Code session transcripts.
 *
 * The picker writes to stderr. The chosen transcript writes to stdout, so the
 * output pipes into grep, less, and friends.
 *
 *   bun run sessions-viewer.ts                    # pick a session
 *   bun run sessions-viewer.ts 8e35cc5d           # by id prefix or path
 *   bun run sessions-viewer.ts --latest           # newest session
 *   bun run sessions-viewer.ts --latest --max-lines 10
 *   bun run sessions-viewer.ts --latest --width 100
 *   bun run sessions-viewer.ts --latest --message 7          # one message, in full
 *   bun run sessions-viewer.ts --latest --compaction 1       # one compaction summary
 *   bun run sessions-viewer.ts --latest --from-compaction 1  # from a compaction onward
 *   bun run sessions-viewer.ts --latest --skip-truncate-re sitrep
 */

// @ts-ignore - package ships no types
import markdownToAnsi from "markdown-to-ansi";
// @ts-ignore - package ships no types
import wrapAnsi from "wrap-ansi";
import { Command } from "commander";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

const PROJECTS = join(homedir(), ".commandcode", "projects");
const SIDECARS = [".checkpoints.jsonl", ".prompts.jsonl"];
const ARG_LIMIT = 20;
const BODY_INDENT = "  ";
const TOOL_INDENT = "    ";

const ansi = markdownToAnsi({ stream: process.stdout });
const color = (text: string, code: string): string =>
  process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text;

const label = (role: string): string =>
  role === "user" ? color(" user ", "44;97") : color(" asst ", "100;97");

const compactionLabel = (): string => color(" compact ", "45;97");

type Session = { path: string; id: string; short: string; title: string; mtime: number };
type Block =
  | { kind: "message"; role: string; text: string; raw: string; tools: string[]; no: number }
  | { kind: "compaction"; summary: string; no: number };

async function listSessions(): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const project of await readdir(PROJECTS)) {
    const dir = join(PROJECTS, project);
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".jsonl") || SIDECARS.some((s) => file.endsWith(s))) continue;
      const path = join(dir, file);
      let title = "";
      try {
        title = JSON.parse(await readFile(path.replace(/\.jsonl$/, ".meta.json"), "utf8")).title ?? "";
      } catch {
        title = "";
      }
      sessions.push({
        path,
        id: file.replace(/\.jsonl$/, ""),
        short: file.split("-")[0],
        title,
        mtime: (await stat(path)).mtimeMs,
      });
    }
  }
  return sessions.sort((a, b) => b.mtime - a.mtime);
}

async function pick(sessions: Session[]): Promise<Session> {
  process.stderr.write("Sessions (newest first). Enter a number.\n");
  sessions.forEach((session, index) => {
    const project = basename(dirname(session.path));
    process.stderr.write(`  ${index + 1}. [${project}] ${session.title || "(untitled)"}\n`);
  });
  while (true) {
    process.stderr.write("> ");
    const answer = await new Promise<string>((resolve) => {
      process.stdin.once("data", (chunk) => resolve(chunk.toString()));
    });
    const index = Number(answer.trim());
    if (Number.isInteger(index) && index >= 1 && index <= sessions.length) {
      return sessions[index - 1];
    }
  }
}

function resolve(sessions: Session[], argument: string): Session {
  const byShort = sessions.find((session) => session.short === argument);
  if (byShort) return byShort;
  const exact = sessions.find((session) => session.path === argument);
  if (exact) return exact;
  const byPrefix = sessions.find((session) => basename(session.path).startsWith(argument));
  if (byPrefix) return byPrefix;
  process.stderr.write(`Unknown session: ${argument}\n`);
  process.exit(1);
}

function flatten(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ") : JSON.stringify(value);
  return text.length > ARG_LIMIT ? `${text.slice(0, ARG_LIMIT)}...` : text;
}

function toolLine(block: any): string {
  const input = block.input && typeof block.input === "object" ? block.input : {};
  const pairs = Object.entries(input)
    .map(([key, value]) => `${key}=${color(`{${flatten(value)}}`, "2")}`)
    .join(" ");
  const name = color(`[${block.name}]`, "1");
  return `${name} ${pairs}`.trimEnd();
}

async function collect(path: string): Promise<Block[]> {
  const blocks: Block[] = [];
  let messageNo = 0;
  let compactionNo = 0;
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "compaction") {
      if (typeof entry.summary === "string" && entry.summary.trim()) {
        compactionNo += 1;
        blocks.push({ kind: "compaction", summary: ansi(entry.summary).trimEnd(), no: compactionNo });
      }
      continue;
    }
    if (entry.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;

    const texts: string[] = [];
    const rawTexts: string[] = [];
    const tools: string[] = [];
    for (const block of entry.message.content ?? []) {
      if (block?.type === "text" && block.text) {
        texts.push(ansi(block.text).trimEnd());
        rawTexts.push(block.text);
      } else if (block?.type === "tool_use") tools.push(toolLine(block));
    }
    if (texts.length === 0 && tools.length === 0) continue;
    messageNo += 1;
    blocks.push({
      kind: "message",
      role,
      text: texts.join(" "),
      raw: rawTexts.join(" "),
      tools,
      no: messageNo,
    });
  }
  return blocks;
}

function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  return wrapAnsi(text, Math.max(20, width - BODY_INDENT.length), { hard: true, trim: false }).split("\n");
}

function body(text: string, width: number): string[] {
  return wrapText(text, width).map((line) => (BODY_INDENT + line).trimEnd());
}

function labelLine(role: string): string {
  return label(role).trimEnd();
}

function content(
  block: Extract<Block, { kind: "message" }>,
  chatOnly: boolean,
  width: number,
): { body: string[]; tools: string[] } {
  const tools = chatOnly ? [] : block.tools.map((tool) => (TOOL_INDENT + tool).trimEnd());
  return { body: body(block.text, width), tools };
}

function hint(script: string, args: string): string {
  return `${TOOL_INDENT}${color("→", "1;32")} ${color(`bun run ${script} ${args}`, "2")}`;
}

function printBody(lines: string[], maxLines: number): boolean {
  if (lines.length > maxLines) {
    for (const line of lines.slice(0, maxLines)) process.stdout.write(`${line}\n`);
    process.stdout.write(`${BODY_INDENT}... ${lines.length - maxLines} more lines\n`);
    return true;
  }
  for (const line of lines) process.stdout.write(`${line}\n`);
  return false;
}

type RenderOptions = {
  session: Session;
  script: string;
  chatOnly: boolean;
  maxLines: number;
  width: number;
  hints: boolean;
  skipTruncate: RegExp | null;
};

function render(blocks: Block[], options: RenderOptions): void {
  const { session, script, chatOnly, maxLines, width, hints, skipTruncate } = options;
  for (const block of blocks) {
    if (block.kind === "compaction") {
      process.stdout.write(`${compactionLabel()}\n`);
      printBody(body(block.summary, width), hints ? maxLines : Number.POSITIVE_INFINITY);
      if (hints) {
        process.stdout.write(`${hint(script, `${session.short} --compaction ${block.no}`)}\n`);
        process.stdout.write(`${hint(script, `${session.short} --from-compaction ${block.no}`)}\n`);
      }
      continue;
    }

    const { body: lines, tools } = content(block, chatOnly, width);
    if (chatOnly && lines.length === 0) continue;
    process.stdout.write(`${labelLine(block.role)}\n`);
    const limit = skipTruncate?.test(block.raw) ? Number.POSITIVE_INFINITY : maxLines;
    const truncated = printBody(lines, limit);
    if (truncated && hints) {
      process.stdout.write(`${hint(script, `${session.short} --message ${block.no}`)}\n`);
    }
    for (const line of tools) process.stdout.write(`${line}\n`);
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("sessions-viewer")
    .description("Browse Command Code session transcripts.")
    .argument("[session]", "session id prefix or transcript path")
    .option("--latest", "use the newest session")
    .option("-n, --max-lines <count>", "max lines per message before truncating", "5")
    .option("-w, --width <cols>", "max line width (default: terminal width)")
    .option("-m, --message <index>", "print only this message, in full")
    .option("--compaction <index>", "print only this compaction summary, in full")
    .option("--from-compaction <index>", "print the transcript from this compaction onward")
    .option("--skip-truncate-re <regex>", "never truncate messages matching this regex")
    .option("-c, --chat-only", "hide tool calls")
    .parse();

  const options = program.opts();
  const maxLines = Number.parseInt(options.maxLines, 10);
  const width = options.width ? Number.parseInt(options.width, 10) : (process.stdout.columns ?? 80);
  const sessions = await listSessions();
  if (sessions.length === 0) process.exit(1);

  const [argument] = program.args;
  const chosen =
    options.latest ? sessions[0]
    : argument ? resolve(sessions, argument)
    : process.stdin.isTTY ? await pick(sessions)
    : sessions[0];

  const script = relative(process.cwd(), process.argv[1] ?? "sessions-viewer.ts");
  const blocks = await collect(chosen.path);

  let skipTruncate: RegExp | null = null;
  if (options.skipTruncateRe) {
    try {
      skipTruncate = new RegExp(options.skipTruncateRe, "i");
    } catch {
      process.stderr.write(`Invalid regex: ${options.skipTruncateRe}\n`);
      process.exit(1);
    }
  }

  const base: RenderOptions = {
    session: chosen,
    script,
    chatOnly: Boolean(options.chatOnly),
    maxLines,
    width,
    hints: true,
    skipTruncate,
  };

  if (options.message || options.compaction) {
    const kind = options.message ? "message" : "compaction";
    const index = Number.parseInt(options.message ?? options.compaction, 10);
    const block = blocks.find((candidate) => candidate.kind === kind && candidate.no === index);
    if (!block) {
      process.stderr.write(`No ${kind} ${index} in this session.\n`);
      process.exit(1);
    }
    render([block], { ...base, hints: false, maxLines: Number.POSITIVE_INFINITY });
    return;
  }

  if (options.fromCompaction) {
    const index = Number.parseInt(options.fromCompaction, 10);
    const start = blocks.findIndex(
      (candidate) => candidate.kind === "compaction" && candidate.no === index,
    );
    if (start < 0) {
      process.stderr.write(`No compaction ${index} in this session.\n`);
      process.exit(1);
    }
    process.stderr.write(`session: ${chosen.path}\n`);
    render(blocks.slice(start), base);
    return;
  }

  process.stderr.write(`session: ${chosen.path}\n`);
  render(blocks, base);
}

await main();
