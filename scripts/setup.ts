#!/usr/bin/env bun
/**
 * Install Thursday.
 *
 * One root holds everything the install owns:
 *
 *     <root>/thursday.toml
 *     <root>/checkout/      git clone
 *     <root>/state/         sidecar, logs, caches
 *     <root>/.gitignore     ignores checkout/ and state/
 *
 * The user's own procedures, scratch, and notes live outside the root, so they
 * survive a reinstall.
 *
 * Every action has a human path and a machine path. Without flags it asks one
 * question and prints what it plans to do. With flags it does exactly that and
 * says nothing on stdout. `--json` puts the resolved paths on stdout; everything
 * else goes to stderr.
 *
 * Usage:
 *     bun run scripts/setup.ts
 *     bun run scripts/setup.ts --personal ~/th --skills-dir ~/.commandcode/skills --yes
 *     bun run scripts/setup.ts --dry-run
 *     bun run scripts/setup.ts --home /tmp/fake --personal /tmp/fake/th --yes
 *     bun run scripts/setup.ts --json
 *     bun run scripts/setup.ts --undo
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import process from "node:process";

const REPO = resolve(import.meta.dir, "..");
const VERSION = "0.1.0";

type Layout = {
  home: string;
  root: string;
  checkout: string;
  state: string;
  config: string;
  personal: string;
  procedures: string;
  scratch: string;
  temp: string;
  skillsDir: string;
  source: string;
};

function fail(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function expand(path: string, home: string) {
  return path.startsWith("~") ? join(home, path.slice(1)) : resolve(path);
}

function rootFor(home: string, platform = process.platform) {
  const data = process.env.XDG_DATA_HOME;
  if (data) return join(data, "thursday");
  if (platform === "darwin") {
    return join(home, "Library/Application Support/thursday");
  }
  if (platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData/Local");
    return join(local, "thursday");
  }
  return join(home, ".local/share/thursday");
}

function defaultPersonal(home: string, platform = process.platform) {
  if (platform === "darwin") return join(home, "Documents/Thursday");
  return join(home, "th");
}

function describe(layout: Layout) {
  return {
    version: VERSION,
    root: layout.root,
    config: layout.config,
    checkout: layout.checkout,
    state: layout.state,
    personal: layout.personal,
    skillsDir: layout.skillsDir,
    source: layout.source,
    temp: layout.temp,
  };
}

function configToml(layout: Layout) {
  return `# Written by Thursday setup. Resolved per platform; paths are absolute.
[install]
repo = ${JSON.stringify(layout.checkout)}
version = ${JSON.stringify(VERSION)}
skills = ${JSON.stringify(layout.skillsDir)}
platform = ${JSON.stringify(process.platform)}

[personal]
dir = ${JSON.stringify(layout.personal)}
procedures = ${JSON.stringify(layout.procedures)}
scratch = ${JSON.stringify(layout.scratch)}
scope = "global"

[paths]
root = ${JSON.stringify(layout.root)}
state = ${JSON.stringify(layout.state)}
temp = ${JSON.stringify(layout.temp)}

[learned]
spiel = false
lenses = false
`;
}

async function ask(question: string, fallback: string) {
  process.stderr.write(`${question}${fallback ? ` [${fallback}]` : ""} `);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  const answer = new TextDecoder().decode(value ?? new Uint8Array()).trim();
  return answer || fallback;
}

async function gitRemote(repo: string) {
  try {
    const proc = Bun.spawn(["git", "-C", repo, "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    return out.trim();
  } catch {
    return "";
  }
}

async function cloneInto(source: string, target: string) {
  const proc = Bun.spawn(["git", "clone", "--quiet", source, target], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) fail(`could not clone ${source} into ${target}`, 2);

  // A local clone points origin at the local path. Repoint it at the real
  // remote so the checkout can be updated later.
  const origin = await gitRemote(source);
  if (origin && origin !== source) {
    const set = Bun.spawn(
      ["git", "-C", target, "remote", "set-url", "origin", origin],
      { stdout: "ignore", stderr: "ignore" },
    );
    await set.exited;
  }
}

async function generateSkills(checkout: string, skillsDir: string) {
  const proc = Bun.spawn(
    ["bun", "run", join(checkout, "scripts", "gen-th-skills.ts"), "--out", skillsDir],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) fail(`skill generation failed in ${checkout}`, 2);
}

async function install(layout: Layout, dry: boolean) {
  const steps: [string, string][] = [
    [layout.root, "mkdir"],
    [layout.state, "mkdir"],
    [join(layout.root, ".gitignore"), "write: checkout/ state/"],
    [layout.checkout, "git clone"],
    [layout.personal, "mkdir"],
    [layout.procedures, "mkdir"],
    [layout.scratch, "mkdir"],
    [layout.config, "write toml"],
    [layout.skillsDir, "install skills"],
  ];

  for (const [path, action] of steps) {
    console.error(`  ${dry ? "would " : ""}${action.padEnd(16)} ${path}`);
  }

  if (dry) return;

  await mkdir(layout.root, { recursive: true });
  await mkdir(layout.state, { recursive: true });
  await writeFile(
    join(layout.root, ".gitignore"),
    "checkout/\nstate/\n",
    "utf8",
  );

  if (await exists(layout.checkout)) {
    console.error("  checkout exists, leaving it alone");
  } else {
    await cloneInto(layout.source, layout.checkout);
  }

  await mkdir(layout.procedures, { recursive: true });
  await mkdir(layout.scratch, { recursive: true });
  await mkdir(dirname(layout.config), { recursive: true });
  await writeFile(layout.config, configToml(layout), "utf8");

  await mkdir(layout.skillsDir, { recursive: true });
  await generateSkills(layout.checkout, layout.skillsDir);
}

/** Thursday's own skills: the root skill plus one per verb. */
async function generatedSkillNames(checkout: string) {
  const rootSkill = join(checkout, ".agents", "skills", "thursday", "SKILL.md");
  const names = new Set<string>(["thursday"]);
  if (!(await exists(rootSkill))) return names;

  for (const line of (await readFile(rootSkill, "utf8")).split("\n")) {
    const match = line.match(/^\|\s*`(\/th[a-z]*)`\s*\|/);
    if (match) names.add(match[1].slice(1));
  }

  return names;
}

async function undo(layout: Layout, dry: boolean, purgePersonal: boolean) {
  // Remove our skills by name. Never remove the skills directory itself: it
  // belongs to the harness and holds other people's skills.
  const names = await generatedSkillNames(layout.checkout);
  if (names.size === 1) {
    console.error(
      `  no checkout at ${layout.checkout}, so the verb skills cannot be named`,
    );
    console.error(`  remove ${join(layout.skillsDir, "th*")} by hand`);
  }

  for (const name of names) {
    const path = join(layout.skillsDir, name);
    if (!(await exists(path))) continue;
    console.error(`  ${dry ? "would remove" : "removing"} ${path}`);
    if (!dry) await rm(path, { recursive: true, force: true });
  }

  if (await exists(layout.root)) {
    console.error(`  ${dry ? "would remove" : "removing"} ${layout.root}`);
    if (!dry) await rm(layout.root, { recursive: true, force: true });
  }

  if (purgePersonal && (await exists(layout.personal))) {
    console.error(`  ${dry ? "would remove" : "removing"} ${layout.personal}`);
    if (!dry) await rm(layout.personal, { recursive: true, force: true });
  } else if (!purgePersonal) {
    console.error("");
    console.error(`  kept ${layout.personal} — it is your content, not the install`);
    console.error("  pass --purge-personal to remove it too");
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      home: { type: "string" },
      personal: { type: "string" },
      "skills-dir": { type: "string" },
      from: { type: "string" },
      config: { type: "string" },
      root: { type: "string" },
      yes: { type: "boolean", short: "y" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      undo: { type: "boolean" },
      "purge-personal": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.error(
      [
        "usage: bun run scripts/setup.ts [flags]",
        "",
        "  --home <dir>        resolve everything against this home",
        "  --personal <dir>    where your procedures and notes live",
        "  --skills-dir <dir>  where your agent loads skills (required)",
        "  --from <path|url>   clone from here instead of this checkout",
        "  --root <dir>        override the Thursday root",
        "  --config <path>     override the toml path",
        "  --yes               no questions",
        "  --dry-run           print what would happen, write nothing",
        "  --json              resolved paths on stdout",
        "  --undo              remove what setup created",
        "  --purge-personal    with --undo, also remove your personal dir",
      ].join("\n"),
    );
    return 0;
  }

  const home = expand(values.home ?? homedir(), homedir());
  const root = values.root ? expand(values.root, home) : rootFor(home);
  const personal = expand(values.personal ?? defaultPersonal(home), home);

  const layout: Layout = {
    home,
    root,
    checkout: join(root, "checkout"),
    state: join(root, "state"),
    config: values.config ? expand(values.config, home) : join(root, "thursday.toml"),
    personal,
    procedures: join(personal, "procedures"),
    scratch: join(personal, "scratch"),
    temp: join(tmpdir(), "th-scratch"),
    skillsDir: values["skills-dir"] ? expand(values["skills-dir"], home) : "",
    source: values.from ? expand(values.from, home) : REPO,
  };

  if (values.json) console.log(JSON.stringify(describe(layout), null, 2));

  if (values.undo) {
    await undo(layout, Boolean(values["dry-run"]), Boolean(values["purge-personal"]));
    return 0;
  }

  // The skills dir is the one thing we cannot guess: harnesses disagree and
  // invent new ones. Ask a human, require a script.
  if (!layout.skillsDir) {
    if (values.yes || values["dry-run"]) {
      fail(
        [
          "--skills-dir is required.",
          "",
          "  command code · ~/.commandcode/skills",
          "  claude code  · ~/.claude/skills",
          "  opencode     · ~/.config/opencode/skills",
          "  codex        · ~/.codex/skills",
          "",
          "  anything else · wherever your agent loads skills from",
        ].join("\n"),
        1,
      );
    }

    const answer = await ask("Where does your agent load skills from?", "");
    if (!answer) fail("no skills dir given", 1);
    layout.skillsDir = expand(answer, home);
  }

  if (!values.personal && !values.yes && !values["dry-run"]) {
    const answer = await ask(
      `Where should your Thursday procedures and notes live?`,
      defaultPersonal(home),
    );
    layout.personal = expand(answer, home);
    layout.procedures = join(layout.personal, "procedures");
    layout.scratch = join(layout.personal, "scratch");
  }

  console.error(`Thursday ${VERSION} · ${process.platform}`);
  await install(layout, Boolean(values["dry-run"]));

  if (!values["dry-run"]) {
    console.error("");
    console.error("  installed. try /thursday in a new session.");
  }

  return 0;
}

process.exit(await main());
