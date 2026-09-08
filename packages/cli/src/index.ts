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
import { join, resolve } from "node:path";
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

function validateThursdayHome(home: string): string | null {
  const unsafe = checkThursdayHomeSafety(home);
  if (unsafe) return unsafe;

  if (!existsSync(home)) {
    return `Error: THURSDAY_HOME not found at ${home}; run 'thursday install' first`;
  }

  const runtimeBin = join(home, "runtime", "node_modules", ".bin", "dsh");
  if (!existsSync(runtimeBin)) {
    return `Error: Thursday runtime not found at ${runtimeBin}`;
  }

  return null;
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
  const KNOWN_COMMANDS = new Set(["serve", "session", "install", "uninstall", "status", "update"]);
  const COMMANDS_NEEDING_HOME = new Set(["serve", "session", "uninstall", "status", "update"]);

  if (!KNOWN_COMMANDS.has(command)) {
    process.stderr.write(`Error: unknown command '${command}'\n\n`);
    printHelp();
    process.exit(1);
  }

  const home = resolveThursdayHome();

  // Unconditional, and BEFORE the dispatch below: no command may act on a home
  // that overlaps the user's dsh install or sits on a WSL drive mount. install
  // is included deliberately -- see checkThursdayHomeSafety.
  const unsafeHome = checkThursdayHomeSafety(home);
  if (unsafeHome) {
    process.stderr.write(`${unsafeHome}\n`);
    process.exit(1);
  }

  if (COMMANDS_NEEDING_HOME.has(command)) {
    const validationError = validateThursdayHome(home);
    if (validationError) {
      process.stderr.write(`${validationError}\n`);
      process.exit(1);
    }
  }

  switch (command) {
    case "serve":
      // Start server with Thursday preset; preset choice in app is via preset picker
      process.exit(await runDsh(home, ["--profile", "web"]));
      break;

    case "session":
      // Start session in Thursday preset (explicit, though serve does same)
      process.exit(await runDsh(home, ["--profile", "web", "session"]));
      break;

    case "install":
      // Installation is handled by I1/I2/I4 install engine
      process.stderr.write("Error: install subcommand not yet implemented\n");
      process.exit(1);
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
