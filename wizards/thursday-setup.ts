#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-net
//
// Thursday install wizard (ticket E1). Runs at the end of `thursday install`;
// safe to rerun (reports the existing configuration and exits 0).
//
// Everything above the "STAGES" marker is the wizard library: do not hand-edit
// it. Author each stage below the marker as one named Pipeline step.
//
//   deno check wizards/thursday-setup.ts
//   THURSDAY_HOME=~/.thursday deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-net wizards/thursday-setup.ts
//
// Self contained: pinned npm: imports resolve from the Deno cache.
// --no-lock keeps Deno from writing a deno.lock file. Nothing touches
// package.json, pnpm-lock.yaml, or node_modules.
//
// The settings surgery below (region patch, provider rendering) mirrors
// packages/install/src/{settings-patch,dsh-import,wizard}.ts, which is the
// tested source of truth. The mirror is deliberate: this script must run on a
// machine with only Deno, before any install-engine bundle exists.

import { $ } from "npm:zx@8.8.5";
import { MepCLI, Pipeline } from "npm:mepcli@1.4.0";

// ── Wizard library: same UX in every wizard. Do not hand-edit. ──

const USE_COLOR = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const BOLD = USE_COLOR ? "\x1b[1m" : "";
const DIM = USE_COLOR ? "\x1b[2m" : "";
const RESET = USE_COLOR ? "\x1b[0m" : "";
const BLUE = USE_COLOR ? "\x1b[34m" : "";
const GREEN = USE_COLOR ? "\x1b[32m" : "";
const YELLOW = USE_COLOR ? "\x1b[33m" : "";

// Author sets this below the STAGES marker to match the step count.
let TOTAL_STAGES = 0;

const ENV_FILE = Deno.env.get("ENV_FILE") ?? ".env";
const WRITTEN_ENV: string[] = [];
const WRITTEN_SECRET: string[] = [];
const SKIPPED: string[] = [];

function progressPath(): string {
  return Deno.env.get("WIZARD_PROGRESS") ?? "./wizard-progress.jsonl";
}

async function appendEvent(event: unknown): Promise<void> {
  try {
    await Deno.writeTextFile(progressPath(), JSON.stringify(event) + "\n", { append: true });
  } catch {
    // Progress must never break the wizard.
  }
}

function clear(): void {
  if (Deno.stdout.isTerminal()) console.clear();
}

// createWizard returns a Pipeline whose hooks clear the screen, print the
// stage counter, and append one JSONL event per step start and completion.
// The counter tracks executed steps, so conditional steps never skew it.
export function createWizard<Ctx extends Record<string, unknown>>(): Pipeline<Ctx> {
  let done = 0;
  return new Pipeline<Ctx>({
    onStepStart: async (meta) => {
      clear();
      const n = done + 1;
      console.log(`\n${BOLD}${BLUE}▸ Stage ${n}/${TOTAL_STAGES} · ${meta.name ?? "step"}${RESET}`);
      await appendEvent({
        type: "stage",
        index: n,
        name: meta.name,
        time: new Date().toISOString(),
      });
    },
    onStepComplete: async (meta) => {
      done += 1;
      await appendEvent({
        type: "stage-complete",
        index: meta.index + 1,
        name: meta.name,
        time: new Date().toISOString(),
      });
    },
  });
}

// banner shows the opening frame: what this wizard does.
// A no answer stops the run before any stage executes.
export async function banner(title: string): Promise<void> {
  clear();
  console.log(`\n${BOLD}${BLUE}  ${title}${RESET}`);
  console.log(`${DIM}  ${TOTAL_STAGES} stages${RESET}\n`);
  console.log(`${DIM}  You drive the browser; this wizard tells you exactly what to do and`);
  console.log(`  captures the values you copy back.${RESET}`);
  const ready = await confirm("Ready to start?");
  if (!ready) {
    say("Stopped. Run the wizard again when ready.");
    Deno.exit(0);
  }
}

export function say(text: string): void {
  console.log(`  ${text}`);
}
export function step(text: string): void {
  console.log(`  ${BLUE}•${RESET} ${text}`);
}
export function note(text: string): void {
  console.log(`  ${DIM}${text}${RESET}`);
}
export function warn(text: string): void {
  console.log(`  ${YELLOW}⚠ ${text}${RESET}`);
}

// open_url opens a URL in the human's browser, cross-platform incl. WSL.
export async function open_url(url: string): Promise<void> {
  console.log(`  ${GREEN}↗ opening${RESET} ${url}`);
  const attempts: Array<() => Promise<unknown>> = [
    () => $`wslview ${url}`,
    () => $`explorer.exe ${url}`,
    () => $`xdg-open ${url}`,
    () => $`open ${url}`,
  ];
  for (const run of attempts) {
    try {
      await run();
      return;
    } catch {
      // Try the next opener.
    }
  }
  warn(`couldn't open a browser, so visit it manually: ${url}`);
}

// confirm asks a y/N gate; resolves true on yes.
export async function confirm(question: string): Promise<boolean> {
  return await MepCLI.confirm({ message: question });
}

function existing(key: string): string | null {
  let text: string;
  try {
    text = Deno.readTextFileSync(ENV_FILE);
  } catch {
    return null;
  }
  let found: string | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith(`${key}=`)) found = line.slice(key.length + 1);
  }
  return found;
}

function keptCurrent(value: string, current: string | null): string {
  if (value.trim() === "" && current) return current;
  return value;
}

// ask reads a visible value; Enter keeps the saved .env value on re-runs.
export async function ask(key: string, promptText: string): Promise<string> {
  const current = existing(key);
  const value = await MepCLI.text({
    message: `${promptText}${current ? " [Enter keeps current]" : ""}`,
    initial: current ?? undefined,
  });
  return keptCurrent(value, current);
}

// ask_secret is like ask, but input stays hidden.
export async function ask_secret(key: string, promptText: string): Promise<string> {
  const current = existing(key);
  const value = await MepCLI.secret({
    message: `${promptText}${current ? " [Enter keeps current]" : ""}`,
    initial: current ?? undefined,
  });
  return keptCurrent(value, current);
}

async function ghReady(): Promise<boolean> {
  try {
    await $`gh auth status`;
    return true;
  } catch {
    return false;
  }
}

// write_env upserts KEY=VALUE into ENV_FILE. Idempotent.
export async function write_env(key: string, value: string): Promise<void> {
  let lines: string[] = [];
  try {
    lines = Deno.readTextFileSync(ENV_FILE).split("\n");
  } catch {
    lines = [];
  }
  const kept = lines.filter((line) => !line.startsWith(`${key}=`));
  const trimmed = kept.join("\n").replace(/\n+$/, "");
  const next = trimmed ? `${trimmed}\n${key}=${value}\n` : `${key}=${value}\n`;
  await Deno.writeTextFile(ENV_FILE, next);
  WRITTEN_ENV.push(key);
  console.log(`  ${GREEN}✓ wrote${RESET} ${key} → ${ENV_FILE}`);
}

// set_secret sets a GitHub Actions repo secret via gh, else records a skip.
export async function set_secret(name: string, value: string): Promise<void> {
  if (await ghReady()) {
    try {
      await $`gh secret set ${name} --body ${value}`;
      WRITTEN_SECRET.push(name);
      console.log(`  ${GREEN}✓ set${RESET} GitHub secret ${name}`);
      return;
    } catch {
      // Fall through to the skip warning.
    }
  }
  SKIPPED.push(`GitHub secret ${name} (set it manually: gh secret set ${name})`);
  warn(`skipped GitHub secret ${name}: gh not ready; set it later`);
}

// set_var sets a GitHub Actions repo variable (non-secret), else skips.
export async function set_var(name: string, value: string): Promise<void> {
  if (await ghReady()) {
    try {
      await $`gh variable set ${name} --body ${value}`;
      console.log(`  ${GREEN}✓ set${RESET} GitHub variable ${name}`);
      return;
    } catch {
      // Fall through to the skip warning.
    }
  }
  SKIPPED.push(`GitHub variable ${name}`);
  warn(`skipped GitHub variable ${name}, gh not ready; set it later`);
}

// finish shows the closing summary and appends the done event.
export async function finish(): Promise<void> {
  console.log(`\n${BOLD}${GREEN}  ✓ Setup complete${RESET}`);
  if (WRITTEN_ENV.length)
    note(`wrote ${WRITTEN_ENV.length} value(s) to ${ENV_FILE}: ${WRITTEN_ENV.join(" ")}`);
  if (WRITTEN_SECRET.length)
    note(`set ${WRITTEN_SECRET.length} GitHub secret(s): ${WRITTEN_SECRET.join(" ")}`);
  if (SKIPPED.length) {
    console.log("");
    warn("still to do by hand:");
    for (const s of SKIPPED) note(`  - ${s}`);
  }
  console.log("");
  await appendEvent({
    type: "done",
    time: new Date().toISOString(),
    envKeys: WRITTEN_ENV,
    secrets: WRITTEN_SECRET,
    skipped: SKIPPED,
  });
}

// STAGES: AGENT EDIT BELOW. One Pipeline step per stage. Set TOTAL_STAGES to match.
// zx escape hatch: use $`cmd args` for shell, e.g. await $`gh auth status`.
TOTAL_STAGES = 5;

// ── Thursday paths. Everything the wizard writes is under THURSDAY_HOME. ──

function expandHome(p: string): string {
  const home = Deno.env.get("HOME") ?? "";
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

const THURSDAY_HOME = (() => {
  const raw = Deno.env.get("THURSDAY_HOME")?.trim();
  return raw && raw !== "" ? expandHome(raw) : expandHome("~/.thursday");
})();
const THURSDAY_DSH = `${THURSDAY_HOME}/dsh`;
const USER_DSH = (() => {
  const raw = Deno.env.get("DSH_HOME")?.trim();
  return raw && raw !== "" ? expandHome(raw) : expandHome("~/.dsh");
})();
const SETTINGS_PATH = `${THURSDAY_DSH}/settings.yaml`;
const RECEIPT_PATH = `${THURSDAY_HOME}/state/wizard.json`;

interface ProviderEntry {
  name: string;
  displayName: string;
  api: string;
  baseURL: string;
  apiKeyEnv?: string;
}

type Ctx = {
  branch: string;
  meridianPort: number | null;
  providerList: ProviderEntry[];
  models: { frontier: string; flash: string };
  done: string | null;
}

// Auxiliary answers that are not chain routes. Pipeline context carries the
// values the receipt needs; this carries the rest.
const W = {
  imported: false,
  verified: false,
  fallback: null as string | null,
  adopted: null as { orchestrator: string[]; subagent: string[] } | null,
  defaultModel: null as { provider: string; model: string } | null,
  credSrc: null as string | null,
};

// Rerun is a no-op that reports the existing configuration.
try {
  const receipt = JSON.parse(Deno.readTextFileSync(RECEIPT_PATH));
  if (!Deno.args.includes("--force")) {
    say(
      `Install wizard already ran: frontier ${receipt.frontier}, flash ${receipt.flash}. ` +
        `Nothing was changed; re-run with --force to configure again.`,
    );
    Deno.exit(0);
  }
} catch {
  // No receipt: first run (or --force).
}

async function hasBin(name: string): Promise<boolean> {
  try {
    await $`command -v ${name}`;
    return true;
  } catch {
    return false;
  }
}

type Health = { status: number; body: string };
async function probePort(port: number): Promise<Health | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

// meridian identifies as the pair auth + claudeExecutable (see
// packages/install/src/meridian.ts), and must be logged in to be usable.
function assessHealth(port: number, probe: Health | null): { ok: boolean; line: string } {
  if (probe === null) {
    return {
      ok: false,
      line:
        `Nothing on port ${port} looks like meridian: nothing answered. ` +
        `Check the port, or choose the free provider instead.`,
    };
  }
  if (probe.status !== 200) {
    return {
      ok: false,
      line:
        `Nothing on port ${port} looks like meridian: it answered HTTP ${probe.status}, not 200. ` +
        `Check the port, or choose the free provider instead.`,
    };
  }
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(probe.body);
  } catch {
    return {
      ok: false,
      line:
        `Nothing on port ${port} looks like meridian: it answered something that is not JSON. ` +
        `Check the port, or choose the free provider instead.`,
    };
  }
  const auth = doc.auth as Record<string, unknown> | undefined;
  const claudeExe = doc.claudeExecutable as Record<string, unknown> | undefined;
  if (
    typeof auth !== "object" ||
    auth === null ||
    typeof claudeExe !== "object" ||
    claudeExe === null
  ) {
    return {
      ok: false,
      line:
        `Nothing on port ${port} looks like meridian: it answered JSON, but without ` +
        `auth and claudeExecutable: a health endpoint, not meridian. ` +
        `Check the port, or choose the free provider instead.`,
    };
  }
  if (auth.loggedIn !== true) {
    return {
      ok: false,
      line:
        `meridian is running on port ${port}, but nobody is signed in, so every ` +
        `request would fail. Sign in with 'meridian login', then run this again.`,
    };
  }
  const version = typeof doc.version === "string" ? ` ${doc.version}` : "";
  const plan =
    typeof auth.subscriptionType === "string" ? ` on a ${auth.subscriptionType} plan` : "";
  return { ok: true, line: `meridian${version} is running on port ${port} and signed in${plan}.` };
}

function patchRegion(content: string, begin: string, end: string, body: string[]): string {
  const lines = content.split("\n");
  const b = lines.findIndex((l) => l.includes(begin));
  const e = lines.findIndex((l) => l.includes(end));
  if (b === -1 || e === -1 || e <= b) {
    throw new Error(`settings region markers not found: ${begin} / ${end}`);
  }
  return [...lines.slice(0, b + 1), ...body, ...lines.slice(e)].join("\n");
}

// Line-parse of the dsh settings file. dsh writes this file itself in a stable
// shape (llm-pi-ai.providers.* with displayName/apiKeyEnv/api/baseURL), so a
// small reader is enough for a preview plus a re-render; the engine in
// packages/install/src/dsh-import.ts is the tested source of truth.
function parseDshProviders(text: string): ProviderEntry[] {
  const out: ProviderEntry[] = [];
  const lines = text.split("\n");
  let current: ProviderEntry | null = null;
  let inProviders = false;
  for (const line of lines) {
    if (/^  providers:/.test(line)) {
      inProviders = true;
      continue;
    }
    if (!inProviders) continue;
    if (/^\S/.test(line)) break;
    const nameMatch = /^    ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (nameMatch) {
      if (current !== null && current.baseURL !== "") out.push(current);
      current = {
        name: nameMatch[1],
        displayName: nameMatch[1],
        api: "openai-completions",
        baseURL: "",
      };
      continue;
    }
    if (current === null) continue;
    const kv = /^      ([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === "displayName" && value) current.displayName = value;
    else if (key === "apiKeyEnv" && value) current.apiKeyEnv = value;
    else if (key === "api" && value) current.api = value;
    else if (key === "baseURL" && value) current.baseURL = value;
  }
  if (current !== null && current.baseURL !== "") out.push(current);
  return out;
}

function parseDshDefaultModel(text: string): { provider: string; model: string } | null {
  const block = /agent-default-model:\s*\n((?:  [^\n]*\n)+)/.exec(text);
  if (!block) return null;
  const provider = /^  provider:\s*(\S+)/m.exec(block[1]);
  const model = /^  model:\s*(\S+)/m.exec(block[1]);
  if (!provider || !model) return null;
  return { provider: provider[1], model: model[1] };
}

// Adopt only personal/work entries whose orchestrator and subagent are plain
// string lists — the shape the chains region can render. Anything else is
// left as the template rather than guessed at.
function parseDshChains(text: string): { orchestrator: string[]; subagent: string[] } | null {
  return parseProfileChains(text, "personal") ?? parseProfileChains(text, "work");
}

function parseProfileChains(
  text: string,
  profile: string,
): { orchestrator: string[]; subagent: string[] } | null {
  const block = new RegExp(
    `^  ${profile}:\\s*\\n((?:    [^\\n]*\\n|(?:      [^\\n]*\\n)+)+)`,
    "m",
  ).exec(text);
  if (!block) return null;
  const get = (key: string): string[] | null => {
    const section = new RegExp(`^    ${key}:\\s*\\n((?:      - [^\\n]*\\n)+)`, "m").exec(block[1]);
    if (!section) return null;
    const items = section[1]
      .split("\n")
      .map((l) => /^      - (\S+)\s*$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);
    return items.length > 0 ? items : null;
  };
  const orchestrator = get("orchestrator");
  const subagent = get("subagent");
  if (orchestrator === null || subagent === null) return null;
  return { orchestrator, subagent };
}

function renderProvider(p: ProviderEntry): string[] {
  const lines = [`    ${p.name}:`, `      displayName: ${p.displayName}`];
  lines.push(
    p.apiKeyEnv ? `      apiKeyEnv: ${p.apiKeyEnv}` : `      # local proxy: no key required`,
  );
  lines.push(`      api: ${p.api}`, `      baseURL: ${p.baseURL}`);
  return lines;
}

function renderChains(frontier: string[], flash: string[]): string[] {
  const r = (routes: string[]) => routes.map((route) => `    - ${route}`);
  return [
    `    personal-orchestrator:`,
    ...r(frontier),
    `    work-orchestrator:`,
    `    - chain:personal-orchestrator`,
    `    subagent:`,
    ...r(flash),
    `    subagent-work:`,
    `    - chain:subagent`,
    `    see:`,
    ...r([flash[0] ?? "deepseek-official/deepseek-v4-flash"]),
    `    see-work:`,
    `    - chain:see`,
  ];
}

function patchDefaultModel(content: string, provider: string, model: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.includes("agent-default-model:"));
  if (start === -1) throw new Error("agent-default-model block not found");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i++) {
    if (/^  provider: /.test(lines[i])) lines[i] = `  provider: ${provider}`;
    else if (/^  model: /.test(lines[i])) lines[i] = `  model: ${model}`;
  }
  return lines.join("\n");
}

await banner("Thursday setup");
await createWizard<Ctx>()
  .step("branch", async () => {
    const claude = await hasBin("claude");
    const meridianBin = await hasBin("meridian");
    if (claude && !meridianBin) {
      say("Found a Claude installation but no meridian: the first answer sets it up.");
    }
    return await MepCLI.select<string>({
      message: "Do you have a Claude Code subscription you would like to use with Thursday?",
      choices: [
        {
          title: "Yes, help me set up meridian now",
          value: "setup",
          description: "Best effort: installs meridian where it can, else prints exact steps",
        },
        {
          title: "meridian is installed, here is the port number",
          value: "port",
          description: "The port is verified before anything is written",
        },
        { title: "I do not want this", value: "skip", description: "Continue on the free path" },
      ],
    });
  })
  .step("meridianPort", async (ctx) => {
    if (ctx.branch === "setup") {
      if (!(await hasBin("meridian"))) {
        say("Trying to install meridian (best effort) …");
        try {
          await $`npm install -g meridian`;
        } catch {
          warn("Could not install meridian here (no network, or no npm).");
          say("To do it by hand, then re-run this wizard with --force:");
          step("npm install -g meridian");
          step("meridian login");
          step("meridian serve  (note the port it prints)");
          say("Setup still completes on the free-provider path below.");
          return null;
        }
      }
      const verdict = assessHealth(9000, await probePort(9000));
      say(verdict.line);
      if (!verdict.ok) {
        say("meridian was NOT written into the configuration.");
        return null;
      }
      return 9000;
    }
    if (ctx.branch === "port") {
      const port = await MepCLI.number({
        message: "Which port is meridian on?",
        min: 1,
        max: 65535,
        initial: 9000,
      });
      const verdict = assessHealth(port, await probePort(port));
      say(verdict.line);
      if (!verdict.ok) {
        say("The port was NOT written into the configuration; continuing on the free path.");
        return null;
      }
      return port;
    }
    say("Skipped meridian; setup continues on the free-provider path.");
    return null;
  })
  .step("providerList", async (ctx) => {
    const list: ProviderEntry[] = [];
    if (ctx.meridianPort !== null) {
      list.push({
        name: "meridian",
        displayName: "meridian (Claude subscription)",
        api: "openai-completions",
        baseURL: `http://127.0.0.1:${ctx.meridianPort}`,
      });
    }
    // One-time import, only on request. This step READS the dsh home; the
    // "done" step performs the copy. Nothing is read outside settings.yaml
    // and .credentials.yaml — never sessions, plugins, skills, storages,
    // attachments, input history, or auth/store.json.
    let settings: string | null = null;
    try {
      settings = Deno.readTextFileSync(`${USER_DSH}/settings.yaml`);
    } catch {
      settings = null;
    }
    if (settings !== null) {
      const found = parseDshProviders(settings);
      say(
        `Found an existing dsh configuration (providers: ${found.map((p) => p.name).join(", ") || "none"}).`,
      );
      if (await confirm("Import its provider and profile configuration into Thursday?")) {
        for (const p of found) {
          if (!list.some((q) => q.name === p.name)) list.push(p);
        }
        W.defaultModel = parseDshDefaultModel(settings);
        W.adopted = parseDshChains(settings);
        try {
          Deno.statSync(`${USER_DSH}/.credentials.yaml`);
          W.credSrc = `${USER_DSH}/.credentials.yaml`;
        } catch {
          W.credSrc = null;
        }
        W.imported = true;
        say("Import accepted: providers plus .credentials.yaml (mode 0600).");
        say("Note: this copy is a point-in-time snapshot — rotating a key in dsh");
        say("will NOT update Thursday. Re-run the import after rotation.");
      } else {
        say("Skipped the import: this install stays byte-identical to a machine with no dsh home.");
      }
    } else {
      say("No dsh home found; continuing with Thursday's own providers.");
    }
    if (list.length === 0) {
      say("Free-provider default kept: deepseek-official needs no account and no key,");
      say("so a user with no paid account finishes setup with a working session.");
    }
    return list;
  })
  .step("models", async (ctx) => {
    // Discovery first: ask each configured provider what it offers. A listing
    // proves the credential works AND the model exists.
    const routes: string[] = [];
    for (const p of ctx.providerList) {
      try {
        const res = await fetch(`${p.baseURL.replace(/\/$/, "")}/models`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = await res.json();
        const ids = ((doc.data ?? []) as Array<{ id?: unknown }>)
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string" && id !== "");
        if (ids.length === 0) throw new Error("empty list");
        say(`discovery for ${p.name}: ${ids.length} model(s); the credential works.`);
        for (const id of ids) routes.push(`${p.name}/${id}`);
      } catch {
        warn(`discovery for ${p.name} failed; its models will be typed by hand, unverified.`);
      }
    }
    let frontier: string;
    let flash: string;
    if (routes.length === 0) {
      warn("No provider could be listed, so both identifiers are typed by hand, UNVERIFIED.");
      frontier = await MepCLI.text({
        message: "Which model should Thursday use for its best thinking? (frontier)",
        validate: (v) => (v.trim() ? true : "Enter a provider/model identifier."),
      });
      flash = await MepCLI.text({
        message: "Which model should Thursday use for bulk work? (flash)",
        validate: (v) => (v.trim() ? true : "Enter a provider/model identifier."),
      });
      say("These could NOT be verified. Check both identifiers before relying on them.");
    } else {
      const choice = (msg: string) =>
        MepCLI.fuzzySelect<string>({
          message: msg,
          choices: routes.map((r) => ({ title: r, value: r })),
        });
      frontier = await choice("Which model should Thursday use for its best thinking? (frontier)");
      flash = await choice("Which model should Thursday use for bulk work? (flash)");
      W.verified = true;
    }
    if (frontier === flash) {
      say(`Frontier and flash are the same model (${frontier}): accepted, and it means`);
      say(`subagents will cost the same as the orchestrator — the cheap/best split is off.`);
    }
    const names = new Set(["deepseek-official", ...ctx.providerList.map((p) => p.name)]);
    if (names.size > 1 && routes.length > 0) {
      const extra = await MepCLI.text({
        message: "Fallback rung for both chains? (Enter for none — a single rung has no failover)",
      });
      if (extra.trim()) {
        W.fallback = extra.trim();
        say(`Fallback rung added to both chains: ${W.fallback}.`);
      } else {
        say("Both chains are single-rung: no failover.");
      }
    } else {
      say("Both chains are single-rung: no failover, because no second provider is configured.");
    }
    return { frontier, flash };
  })
  .step("done", async (ctx) => {
    // Every path below is under THURSDAY_HOME. The AI scratch directory is
    // recorded, never created: it lives outside the home (E6's half).
    let content = Deno.readTextFileSync(SETTINGS_PATH);
    if (ctx.providerList.length > 0) {
      content = patchRegion(
        content,
        "thursday-providers:begin",
        "thursday-providers:end",
        ctx.providerList.flatMap(renderProvider),
      );
    }
    const frontierChain = [ctx.models.frontier, ...(W.fallback ? [W.fallback] : [])];
    const flashChain = [ctx.models.flash, ...(W.fallback ? [W.fallback] : [])];
    const adopted = W.adopted;
    content = patchRegion(
      content,
      "thursday-chains:begin",
      "thursday-chains:end",
      renderChains(adopted?.orchestrator ?? frontierChain, adopted?.subagent ?? flashChain),
    );
    const head = ctx.models.frontier.includes("/")
      ? ctx.models.frontier.split("/")
      : ["deepseek-official", ctx.models.frontier];
    const dm = W.defaultModel ?? { provider: head[0], model: head[1] };
    content = patchDefaultModel(content, dm.provider, dm.model);
    Deno.writeTextFileSync(SETTINGS_PATH, content);
    if (W.credSrc !== null) {
      const dest = `${THURSDAY_DSH}/.credentials.yaml`;
      Deno.copyFileSync(W.credSrc, dest);
      Deno.chmodSync(dest, 0o600);
      say("Copied .credentials.yaml with mode 0600.");
    }
    await Deno.mkdir(`${THURSDAY_HOME}/state`, { recursive: true });
    await Deno.writeTextFile(
      RECEIPT_PATH,
      JSON.stringify(
        {
          version: 1,
          frontier: ctx.models.frontier,
          flash: ctx.models.flash,
          verified: W.verified,
          meridian: ctx.meridianPort === null ? null : { port: ctx.meridianPort },
          imported: W.imported,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    say(`Wrote the install receipt to ${RECEIPT_PATH}. Rerunning reports it and changes nothing.`);
    say(
      `Wizard complete: frontier ${ctx.models.frontier} feeds the orchestrator, ` +
        `flash ${ctx.models.flash} feeds subagents${W.verified ? "" : " (UNVERIFIED — see above)"}.`,
    );
    return "done";
  })
  .run();
await finish();
