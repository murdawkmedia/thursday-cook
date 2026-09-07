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

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const VERSION = '0.1.0';

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

function resolveThursdayHome(): string {
  // Q1 resolution order from dsh-home.md
  const envHome = process.env.THURSDAY_HOME;
  if (envHome && envHome.trim()) {
    return envHome.startsWith('~')
      ? resolve(homedir(), envHome.slice(1))
      : resolve(envHome);
  }
  return resolve(homedir(), '.thursday');
}

function validateThursdayHome(home: string): string | null {
  const dshHome = process.env.DSH_HOME || resolve(homedir(), '.dsh');
  
  // Guard against overlapping Thursday and dsh homes (Q2)
  if (home === dshHome || home.startsWith(dshHome + '/') || 
      dshHome.startsWith(home + '/')) {
    return `Error: THURSDAY_HOME at ${home} overlaps with DSH_HOME at ${dshHome}`;
  }

  // WSL /mnt/ check (Q1)
  if (home.startsWith('/mnt/')) {
    return `Error: THURSDAY_HOME must not be under /mnt/ on WSL2; got ${home}`;
  }

  if (!existsSync(home)) {
    return `Error: THURSDAY_HOME not found at ${home}; run 'thursday install' first`;
  }

  const runtimeBin = join(home, 'runtime', 'node_modules', '.bin', 'dsh');
  if (!existsSync(runtimeBin)) {
    return `Error: Thursday runtime not found at ${runtimeBin}`;
  }

  return null;
}

async function runDsh(
  home: string,
  args: string[]
): Promise<number> {
  const dshPath = join(home, 'runtime', 'node_modules', '.bin', 'dsh');
  
  return new Promise((resolve) => {
    const child = spawn(dshPath, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        // Q2: Set DSH_HOME unconditionally, overwriting any inherited value
        DSH_HOME: join(home, 'dsh'),
        // Q2: Prepend Thursday's dsh to PATH so `dsh` means Thursday's dsh
        PATH: `${join(home, 'runtime', 'node_modules', '.bin')}:${process.env.PATH || ''}`,
      },
    });

    child.on('exit', (code) => {
      resolve(code ?? 0);
    });

    child.on('error', (error) => {
      process.stderr.write(`Error: ${error.message}\n`);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    process.exit(0);
  }

  const home = resolveThursdayHome();
  const validationError = validateThursdayHome(home);
  
  if (validationError) {
    process.stderr.write(`${validationError}\n`);
    process.exit(1);
  }

  switch (command) {
    case 'serve':
      // Start server with Thursday preset; preset choice in app is via preset picker
      process.exit(await runDsh(home, ['--profile', 'web']));
      break;

    case 'session':
      // Start session in Thursday preset (explicit, though serve does same)
      process.exit(await runDsh(home, ['--profile', 'web', 'session']));
      break;

    case 'install':
      // Installation is handled by I1/I2/I4 install engine
      process.stderr.write('Error: install subcommand not yet implemented\n');
      process.exit(1);
      break;

    case 'uninstall':
      // Uninstall is handled by I7/I6
      process.stderr.write('Error: uninstall subcommand not yet implemented\n');
      process.exit(1);
      break;

    case 'status':
      // Status is handled by I6
      process.stderr.write('Error: status subcommand not yet implemented\n');
      process.exit(1);
      break;

    case 'update':
      // Update is handled by I5
      process.stderr.write('Error: update subcommand not yet implemented\n');
      process.exit(1);
      break;

    default:
      // Unknown subcommand: print help and exit non-zero (C6 criterion)
      process.stderr.write(`Error: unknown command '${command}'\n\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
