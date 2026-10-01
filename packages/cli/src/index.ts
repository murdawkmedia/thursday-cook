#!/usr/bin/env node
/**
 * thursday: AI development environment launcher
 *
 * Usage: thursday [COMMAND]
 *
 * Commands:
 *   serve              Start the Thursday development server
 *   session            Start a session without starting the server
 *   install            Install Thursday
 *   uninstall          Uninstall Thursday
 *   status             Check Thursday status
 *   update             Update Thursday
 *
 * The Thursday launcher sets the environment (DSH_HOME, PATH) and execs
 * the pinned dsh runtime. Preset choice is made in the app, not on the CLI.
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "0.1.0";

function printHelp(): void {
  const help = `thursday ${VERSION} — AI development environment

Usage:
  thursday              Print this help message
  thursday serve       Start the server
  thursday session     Start a session without the server
  thursday install     Install Thursday
  thursday uninstall   Uninstall Thursday
  thursday status      Check status
  thursday update      Update Thursday

Visit https://trythursday.org for more information.
`;
  process.stdout.write(help);
}

export function resolveThursdayHome(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  // Q1 resolution order from dsh-home.md.
  const envHome = env.THURSDAY_HOME?.trim();
  if (!envHome) return resolve(home, ".thursday");

  // Tilde expansion is done by SLICING PAST THE SEPARATOR, not by handing the
  // remainder to resolve(). `resolve('/home/u', '/thursday')` returns
  // '/thursday' -- resolve discards every segment before an absolute one -- so
  // the obvious `resolve(homedir(), value.slice(1))` turned `~/thursday-test`
  // into a directory at the FILESYSTEM ROOT. That is not a cosmetic path bug:
  // E6 promises that install creates nothing outside the Thursday home, and a
  // resolver that silently relocates the home to `/` breaks the promise before
  // any install step runs.
  if (envHome === "~") return home;
  if (envHome.startsWith("~/")) return resolve(home, envHome.slice(2));
  return resolve(envHome);
}

/**
 * Guards that must hold for EVERY command, install included.
 *
 * Kept separate from the existence checks below because the two have opposite
 * relationships to `install`: install must skip "does the home exist yet"
 * (it is the command that creates it) but must NOT skip "is this home somewhere
 * we are allowed to write". Folding both into one function and excluding
 * install from the whole thing left the command that CREATES the home as the
 * only command that never checked where it was creating it -- so
 * `THURSDAY_HOME=~/.dsh thursday install` would have installed into the user's
 * real dsh home, which is precisely what E6 exists to make impossible.
 */
export function checkThursdayHomeSafety(
  home: string,
  env: Record<string, string | undefined> = process.env,
  userHome: string = homedir(),
): string | null {
  const rawDsh = env.DSH_HOME?.trim();
  const dshHome = rawDsh ? resolve(rawDsh) : resolve(userHome, ".dsh");

  // Guard against overlapping Thursday and dsh homes (Q2). Containment is
  // checked in BOTH directions: a Thursday home inside ~/.dsh would write into
  // the user's install, and a Thursday home CONTAINING ~/.dsh would make
  // uninstall delete it.
  if (home === dshHome || home.startsWith(dshHome + "/") || dshHome.startsWith(home + "/")) {
    return `Error: THURSDAY_HOME at ${home} overlaps with DSH_HOME at ${dshHome}`;
  }

  // WSL /mnt/ check (Q1)
  if (home.startsWith("/mnt/")) {
    return `Error: THURSDAY_HOME must not be under /mnt/ on WSL2; got ${home}`;
  }

  return null;
}

/** Commands the CLI knows. Anything else prints help and exits non-zero. */
export const KNOWN_COMMANDS = new Set([
  "serve",
  "session",
  "install",
  "uninstall",
  "status",
  "update",
]);

/**
 * Commands that require an EXISTING Thursday home.
 *
 * `install` is absent because it is the command that creates the home: on a
 * machine with no Thursday, requiring one answered `thursday install` with
 * "run 'thursday install' first".
 *
 * This set governs the EXISTENCE checks only. It must never govern the safety
 * guards -- see preflight.
 */
export const COMMANDS_NEEDING_HOME = new Set(["serve", "session", "uninstall", "status", "update"]);

export type Preflight = { ok: true; home: string } | { ok: false; message: string };

/**
 * Everything that must be true before a command runs, as a value rather than a
 * sequence of process.exit calls.
 *
 * This is a function, and exported, for a reason a mutation run made concrete.
 * The guards themselves were unit-tested and the tests passed -- but nothing
 * asserted that the DISPATCH called them for `install`, so re-wrapping the call
 * in `COMMANDS_NEEDING_HOME.has(command)` (the exact bug that was just fixed)
 * left the suite green. A guard that is tested in isolation while its call site
 * is untested is a guard with no regression protection at all.
 *
 * Order is load-bearing:
 *   1. unknown command -- so a typo prints help rather than a path error;
 *   2. resolve the home;
 *   3. SAFETY, for every command including install: overlap with the user's dsh
 *      home, and WSL drive mounts. These decide whether we may write here;
 *   4. EXISTENCE, for commands that need a home that already exists.
 */
export function preflight(
  command: string,
  env: Record<string, string | undefined> = process.env,
  userHome: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): Preflight {
  if (!KNOWN_COMMANDS.has(command)) {
    return { ok: false, message: `Error: unknown command '${command}'` };
  }

  const home = resolveThursdayHome(env, userHome);

  const unsafe = checkThursdayHomeSafety(home, env, userHome);
  if (unsafe) return { ok: false, message: unsafe };

  if (COMMANDS_NEEDING_HOME.has(command)) {
    if (!exists(home)) {
      return {
        ok: false,
        message: `Error: THURSDAY_HOME not found at ${home}; run 'thursday install' first`,
      };
    }
    const runtimeBin = join(home, "runtime", "node_modules", ".bin", "dsh");
    if (!exists(runtimeBin)) {
      return { ok: false, message: `Error: Thursday runtime not found at ${runtimeBin}` };
    }
  }

  return { ok: true, home };
}

async function runDsh(home: string, args: string[]): Promise<number> {
  const dshPath = join(home, "runtime", "node_modules", ".bin", "dsh");

  return new Promise((resolve) => {
    const child = spawn(dshPath, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        // Q2: Set DSH_HOME unconditionally, overwriting any inherited value
        DSH_HOME: join(home, "dsh"),
        // Q2: Prepend Thursday's dsh to PATH so `dsh` means Thursday's dsh
        PATH: `${join(home, "runtime", "node_modules", ".bin")}:${process.env.PATH || ""}`,
      },
    });

    child.on("exit", (code) => {
      resolve(code ?? 0);
    });

    child.on("error", (error) => {
      process.stderr.write(`Error: ${error.message}\n`);
      resolve(1);
    });
  });
}

/**
 * `thursday install` — run the composition through the install engine.
 *
 * The engine is imported DYNAMICALLY, for one reason worth stating: `serve` and
 * `session` are the commands a user runs every day, and they must not fail to
 * start because the install engine or the block set has a problem. A top-level
 * import would make a broken block file break the launcher.
 *
 * This function owns no installation logic. It resolves the composition, calls
 * `install()`, and renders the result. Every decision about WHAT to install
 * lives in the blocks, and every decision about HOW lives in the engine — the
 * CLI is the third place that logic could leak into, so it holds none.
 */
async function runInstall(home: string, argv: string[]): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const quiet = argv.includes("--quiet");
  const noWizard = argv.includes("--no-wizard");
  const wizardOnly = argv.includes("--wizard-only");

  const known = ["--dry-run", "--quiet", "--no-wizard", "--wizard-only"];
  const unknown = argv.filter((a) => a.startsWith("-") && !known.includes(a));
  if (unknown.length > 0) {
    process.stderr.write(
      `Error: unknown option${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}\n`,
    );
    process.stderr.write("Usage: thursday install [--dry-run] [--quiet] [--no-wizard] [--wizard-only]\n");
    return 1;
  }
  if (wizardOnly) return runWizard(home);

  const { blocksDir } = await import("@trythursday/blocks");
  const { loadBlockDir, install, BlockError } = await import("@trythursday/install");

  let blocks;
  try {
    blocks = loadBlockDir(blocksDir);
  } catch (error) {
    // A composition that will not load is not a partial install: nothing has
    // run yet, so report every bad block at once and change nothing.
    process.stderr.write(`Error: the Thursday composition could not be loaded\n`);
    if (error instanceof BlockError) {
      for (const problem of error.problems) {
        process.stderr.write(`  ${problem.field}: ${problem.message}\n`);
      }
    } else {
      process.stderr.write(`  ${(error as Error).message}\n`);
    }
    return 1;
  }

  if (blocks.length === 0) {
    process.stderr.write(`Error: no blocks found in ${blocksDir}\n`);
    return 1;
  }

  if (!quiet) {
    process.stdout.write(
      `${dryRun ? "Planning" : "Installing"} ${blocks.length} block${blocks.length === 1 ? "" : "s"} into ${home}\n\n`,
    );
  }

  const result = await install(blocks, { thursdayHome: home, dryRun, quiet });

  if (!quiet) {
    // One line per step that DID something. Steps that found their work already
    // done are counted rather than listed: on a re-run almost every step is a
    // no-op, and a wall of "already installed" buries the few that changed.
    const changed = result.steps.filter((s) => s.changed);
    for (const step of changed) {
      process.stdout.write(`  ${step.step.blockId}  ${step.output || step.step.step.action}\n`);
    }
    const unchanged = result.steps.length - changed.length;
    process.stdout.write(
      `\n${changed.length} step${changed.length === 1 ? "" : "s"} ${dryRun ? "would change" : "changed"}` +
        (unchanged > 0 ? `, ${unchanged} already current` : "") +
        `\n`,
    );
  }

  if (result.problems.length > 0) {
    process.stderr.write(`\n${result.problems.length} problem(s):\n`);
    for (const problem of result.problems) {
      const where = problem.block
        ? `${problem.block}${problem.step !== undefined ? `[${problem.step}]` : ""}: `
        : "";
      process.stderr.write(`  ${where}${problem.message}\n`);
    }
    return 1;
  }

  if (dryRun) return 0;
  if (noWizard) {
    if (!quiet) process.stdout.write(`\nThursday is installed. Start it with:\n  thursday serve\n`);
    return 0;
  }
  const wizardCode = await runWizard(home);
  if (wizardCode !== 0) return wizardCode;
  if (!quiet) process.stdout.write(`\nThursday is installed. Start it with:\n  thursday serve\n`);
  return 0;
}

/**
 * Run the E1 setup wizard (wizards/thursday-setup.ts) with Deno.
 *
 * Deno is resolved from the Thursday home first, where install.sh places it
 * when it is not already on PATH, then from PATH. DENO_DIR is pinned inside the
 * home: Deno's default cache is ~/.cache/deno, and a module cache written there
 * would break the promise that uninstalling Thursday leaves the machine
 * byte-identical.
 *
 * No terminal means no questions can be asked, so the wizard is skipped with the
 * command that runs it later, rather than hanging on a prompt nobody can answer.
 */
async function runWizard(home: string): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(
      `\nNo terminal attached, so the setup wizard was skipped. Run it with:\n  thursday install --wizard-only\n`,
    );
    return 0;
  }
  const wizard = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "wizards", "thursday-setup.ts");
  if (!existsSync(wizard)) {
    process.stderr.write(`Error: the setup wizard is missing from this distribution: ${wizard}\n`);
    return 1;
  }
  const homeDeno = join(home, "runtime", "deno", "bin", "deno");
  const deno = existsSync(homeDeno) ? homeDeno : "deno";
  process.stdout.write(`\nStarting the setup wizard\n`);
  return new Promise((resolveCode) => {
    const child = spawn(
      deno,
      // --no-config and --node-modules-dir=none: the wizard lives inside a
      // checkout that has a package.json and node_modules, and without these
      // Deno switches to resolving npm: imports from that node_modules, where
      // they do not exist. --allow-sys: zx reads os.cpus() at import. Both
      // found by the first real run of the wizard, 2026-09-26.
      [
        "run", "--no-lock", "--no-config", "--node-modules-dir=none",
        "--allow-read", "--allow-write", "--allow-run", "--allow-env", "--allow-net", "--allow-sys",
        wizard,
      ],
      {
        stdio: "inherit",
        env: { ...process.env, THURSDAY_HOME: home, DENO_DIR: join(home, "cache", "deno") },
      },
    );
    child.on("exit", (code) => {
      if (code === 0) return resolveCode(0);
      process.stderr.write(`\nThe setup wizard did not finish (exit ${code}). Re-run it with:\n  thursday install --wizard-only\n`);
      resolveCode(1);
    });
    child.on("error", (error) => {
      process.stderr.write(
        `\nCould not start the setup wizard: ${error.message}\nDeno is required. Re-run install.sh, which installs it into the Thursday home, then:\n  thursday install --wizard-only\n`,
      );
      resolveCode(1);
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    process.exit(0);
  }

  // Dispatch decides BEFORE the home is validated, for two reasons that are both
  // criteria of this ticket.
  //
  // `install` must not require the Thursday home: it is the command that creates
  // it, and on a machine with no Thursday the earlier ordering answered
  // `thursday install` with "run 'thursday install' first". That is circular, and
  // it is the first command a new user runs -- green item 1 is an install on a
  // machine that has never had Thursday.
  //
  // An unknown command must reach the default branch and print help. Validating
  // first made that branch unreachable on exactly the machines where a typo is
  // most likely.
  const checked = preflight(command);
  if (!checked.ok) {
    process.stderr.write(`${checked.message}\n`);
    // An unrecognised command is a usage error, so the usage is what the user
    // needs to see. A home that is unsafe or missing is not: help would bury
    // the one line that says what is wrong.
    if (!KNOWN_COMMANDS.has(command)) {
      process.stderr.write("\n");
      printHelp();
    }
    process.exit(1);
  }
  const home = checked.home;

  switch (command) {
    case "serve":
      // Start server with Thursday preset; preset choice in app is via preset picker
      // Forward the rest of the command line to dsh. Without it `thursday serve`
      // could not take --host or --port, so a containerised Thursday bound the
      // container's own loopback and no host browser could reach it.
      process.exit(await runDsh(home, ["--profile", "web", ...args.slice(1)]));
      break;

    case "session":
      // Start session in Thursday preset (explicit, though serve does same)
      process.exit(await runDsh(home, ["--profile", "web", "session"]));
      break;

    case "install":
      process.exit(await runInstall(home, args.slice(1)));
      break;

    case "uninstall":
      // Uninstall is handled by I7/I6
      process.stderr.write("Error: uninstall subcommand not yet implemented\n");
      process.exit(1);
      break;

    case "status":
      // Status is handled by I6
      process.stderr.write("Error: status subcommand not yet implemented\n");
      process.exit(1);
      break;

    case "update":
      // Update is handled by I5
      process.stderr.write("Error: update subcommand not yet implemented\n");
      process.exit(1);
      break;

    default:
      // Unknown subcommand: print help and exit non-zero (C6 criterion)
      process.stderr.write(`Error: unknown command '${command}'\n\n`);
      printHelp();
      process.exit(1);
  }
}

/**
 * Run only when this file is the process entry point.
 *
 * Without this guard, `import` of this module for a unit test RUNS THE CLI --
 * which parses the ambient argv (vitest's own), fails to match a command, and
 * calls process.exit(1), killing the test runner. The effect is that the path
 * resolver and the home guards, the two pieces most worth testing and the two
 * that decide where files get written, were the parts hardest to reach.
 */
const isEntryPoint = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`Fatal error: ${error.message}\n`);
    process.exit(1);
  });
}
