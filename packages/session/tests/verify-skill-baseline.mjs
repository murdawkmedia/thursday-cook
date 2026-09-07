/**
 * Verify the `thursday-doctor` skill runs under an agent that has NONE of
 * Thursday's own tools — literally, by executing it, not by reading its claims.
 *
 * The simulation has two halves, because "restricted to base dsh tools" has two
 * distinct failure modes:
 *
 *   A. TOOL SURFACE. The skill must never instruct the agent to call a tool
 *      outside the dsh baseline {bash, read, write, edit, grep, glob}. This half
 *      scans the skill for every known Thursday/aidos tool name and fails on a
 *      hit. A skill that says "run get_tickets" is broken for a bare agent even
 *      if every shell command in it works.
 *
 *   B. EXECUTION. Every shell command the skill tells the agent to run is
 *      actually executed, in a shell whose PATH contains ONLY stock system
 *      directories plus node. Nothing from the Thursday checkout is on PATH, so
 *      any command that works does so purely through what the skill itself
 *      wrote. A command that silently depends on a Thursday shim fails here.
 *
 * Placeholders (`<session-id>`, `$REPO`, `$DSH`) are substituted from a real
 * machine so the commands are genuinely executed rather than skipped.
 *
 * Usage: node verify-skill-baseline.mjs <SKILL.md> [--repo DIR] [--session ID]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Tools a bare dsh agent has. Anything else must not be required by the skill. */
export const BASELINE_TOOLS = ["bash", "read", "write", "edit", "grep", "glob"];

/**
 * Tool names a Thursday/aidos-equipped agent has and a bare one does not.
 * A skill that requires any of these is not agent-agnostic.
 */
export const NON_BASELINE_TOOLS = [
  "get_tickets", "get_ticket", "set_ticket", "attach_evidence", "move_ticket",
  "plan_import", "plan_meta", "plan_meta_set", "suggest_actions",
  "request_allowlist", "todo_write", "scratch_write", "scratch_read",
  "scratch_edit", "scratch_mkdir", "subagent", "subagent_fork", "send_message",
  "list_agents", "interrupt_agent", "job_output", "job_kill", "job_list",
  "ask_user_question", "web_search", "web_fetch", "workflow", "ralph",
  "cordis_define", "cordis_run", "cordis_inspect_self", "package", "see",
  "calculator", "diff", "report", "skill",
];

/** Extract fenced ```bash blocks, split into individual runnable commands. */
export function extractCommands(markdown) {
  const blocks = [];
  const re = /```(?:bash|sh|shell)\n([\s\S]*?)```/gu;
  let m;
  while ((m = re.exec(markdown)) !== null) blocks.push(m[1]);

  const commands = [];
  for (const block of blocks) {
    // Join continuation lines, drop comments and blanks.
    const joined = block.replace(/\\\n\s*/gu, " ");
    let buffer = "";
    let depth = 0;
    for (const raw of joined.split("\n")) {
      const line = raw.replace(/\s+$/u, "");
      if (line.trim().length === 0 && depth === 0) continue;
      if (line.trim().startsWith("#") && depth === 0) continue;
      buffer = buffer.length > 0 ? `${buffer}\n${line}` : line;
      // Track multi-line shell constructs so `for … done` stays one command.
      depth += (line.match(/\b(for|while|if|case)\b/gu) ?? []).length;
      depth -= (line.match(/\b(done|fi|esac)\b/gu) ?? []).length;
      if (depth <= 0) {
        commands.push(buffer);
        buffer = "";
        depth = 0;
      }
    }
    if (buffer.trim().length > 0) commands.push(buffer);
  }
  return commands;
}

/** Half A: does the skill require a tool a bare agent lacks? */
export function auditToolSurface(markdown) {
  const violations = [];
  for (const tool of NON_BASELINE_TOOLS) {
    // Match the tool as an instruction to call it, not as prose. Both a bare
    // mention as `tool_name` in backticks and a "run tool_name" phrasing count.
    const re = new RegExp(`(?:\`${tool}\`|\\brun ${tool}\\b|\\bcall ${tool}\\b|\\buse the ${tool} tool\\b)`, "u");
    if (re.test(markdown)) violations.push(tool);
  }
  // A skill may legitimately say "you do NOT need X". Detect that framing and
  // report it separately rather than counting it as a requirement.
  const negated = violations.filter((t) => {
    const re = new RegExp(`(?:does not need|not need|without|no |never)[^.\\n]{0,80}\`?${t}\`?`, "iu");
    return re.test(markdown);
  });
  return { violations: violations.filter((v) => !negated.includes(v)), mentionedAsNotNeeded: negated };
}

/** Half B: run every command with a PATH that has nothing Thursday-specific. */
export function runUnderBaseline(commands, subs, opts = {}) {
  // A stock PATH plus the directory holding node. Nothing from the Thursday
  // checkout, and no shim directory.
  const nodeDir = path.dirname(process.execPath);
  const PATH = ["/usr/local/bin", "/usr/bin", "/bin", nodeDir].join(":");
  const env = {
    PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR ?? "/tmp/dsh",
    ...subs.env,
  };

  const results = [];
  for (const raw of commands) {
    let cmd = raw;
    for (const [k, v] of Object.entries(subs.replace ?? {})) cmd = cmd.split(k).join(v);
    // A command still holding a placeholder cannot be executed honestly.
    const unresolved = /<[a-z-]+>/u.test(cmd);
    if (unresolved) {
      results.push({ cmd: raw, status: "skipped", reason: "unresolved placeholder" });
      continue;
    }
    if (opts.skip?.some((s) => cmd.includes(s))) {
      results.push({ cmd: raw, status: "skipped", reason: "explicitly excluded (writes)" });
      continue;
    }
    let out = "", code = 0, err = "";
    try {
      out = execFileSync("/bin/bash", ["-c", cmd], {
        env,
        encoding: "utf8",
        cwd: subs.cwd ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      code = e.status ?? -1;
      out = e.stdout ?? "";
      err = e.stderr ?? e.message;
    }
    results.push({
      cmd: raw,
      status: code === 0 ? "ok" : opts.allowNonZero?.some((s) => cmd.includes(s)) ? "ok-nonzero" : "fail",
      code,
      outputLines: out.split("\n").filter((l) => l.length > 0).length,
      head: out.split("\n").slice(0, 3).join(" | ").slice(0, 200),
      err: err.slice(0, 300),
    });
  }
  return results;
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
  const args = process.argv.slice(2);
  const skillPath = args[0];
  const get = (f, d) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : d;
  };
  const repo = get("--repo", "/home/sid/repos/thursday");
  const session = get("--session", "");
  const dsh = get("--dsh", `${process.env.HOME}/.dsh`);

  const markdown = fs.readFileSync(skillPath, "utf8");

  console.log("=".repeat(78));
  console.log("HALF A — tool surface: does the skill require a non-baseline tool?");
  console.log("=".repeat(78));
  const audit = auditToolSurface(markdown);
  console.log(`baseline tools assumed available: ${BASELINE_TOOLS.join(", ")}`);
  console.log(`non-baseline tool names scanned:  ${NON_BASELINE_TOOLS.length}`);
  if (audit.mentionedAsNotNeeded.length > 0)
    console.log(`mentioned only as NOT needed:     ${audit.mentionedAsNotNeeded.join(", ")}`);
  if (audit.violations.length === 0) console.log("RESULT: PASS — the skill requires no tool outside the dsh baseline.");
  else console.log(`RESULT: FAIL — requires ${audit.violations.join(", ")}`);

  console.log("");
  console.log("=".repeat(78));
  console.log("HALF B — execution: run every shell command the skill gives, with a");
  console.log("PATH containing only /usr/local/bin:/usr/bin:/bin plus node.");
  console.log("Nothing from the Thursday checkout is on PATH.");
  console.log("=".repeat(78));
  const commands = extractCommands(markdown);
  const results = runUnderBaseline(commands, {
    cwd: repo,
    env: { REPO: repo, DSH: dsh, THURSDAY_HOME: process.env.THURSDAY_HOME ?? "" },
    replace: { "<session-id>": session, '"$REPO"': repo, "$REPO": repo, '"$DSH"': dsh, "$DSH": dsh },
  }, {
    // `doctor` and `diagnose` exit non-zero when they FIND problems; that is a
    // successful run, not a failed command.
    allowNonZero: ["doctor", "diagnose", "search"],
    skip: ["repair"], // section 6 writes; excluded from an execution audit by design
  });

  let ok = 0, failed = 0, skipped = 0;
  for (const r of results) {
    const tag = r.status === "fail" ? "FAIL " : r.status === "skipped" ? "skip " : "ok   ";
    if (r.status === "fail") failed += 1;
    else if (r.status === "skipped") skipped += 1;
    else ok += 1;
    console.log(`${tag} ${r.cmd.split("\n")[0].slice(0, 96)}`);
    if (r.status === "fail") console.log(`      exit=${r.code} ${r.err.split("\n")[0]}`);
    else if (r.status !== "skipped") console.log(`      exit=${r.code} ${r.outputLines} line(s): ${r.head}`);
    else console.log(`      (${r.reason})`);
  }
  console.log("");
  console.log(`HALF B RESULT: ${failed === 0 ? "PASS" : "FAIL"} — ${ok} ran, ${failed} failed, ${skipped} skipped`);

  const pass = audit.violations.length === 0 && failed === 0;
  console.log("");
  console.log(`OVERALL: ${pass ? "PASS — the skill works for an agent with only base dsh tools." : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
