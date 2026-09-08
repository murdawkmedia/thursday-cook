/**
 * Thursday uninstall engine: defines outside-the-home paths that must be
 * removed when Thursday is uninstalled, and implements the removal logic.
 *
 * Per docs/dsh-home.md Q6 and Q7, uninstall:
 * - Removes the THURSDAY_HOME directory
 * - Removes three enumerated outside-the-home paths
 * - Runs two post-removal commands (update-desktop-database, gtk-update-icon-cache)
 * - Names any file inside the home that Thursday does not own and ASKS before
 *   deleting it. The default answer, and the answer used whenever there is no
 *   one to ask, is to preserve it: the home's Thursday-owned entries are removed
 *   around it and the file stays where the user put it.
 * - Explicitly names the AI scratch directory and tour workspace as left untouched
 *
 * Q7 states the rule this module must not break: "uninstall names unexpected
 * paths and asks rather than deleting silently". A message promising that a file
 * survives must never be printed by a code path that then deletes it.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

import { resolveThursdayHome as resolveGuardedHome } from "./install";

/**
 * One outside-the-home path or command that uninstall must handle.
 *
 * Effects can be:
 * - A file to delete (kind: "file")
 * - A command to run after deletion (kind: "command")
 */
export interface OutsideTheHomeEffect {
  /** "file" for paths to delete, "command" for executables to run */
  kind: "file" | "command";
  /** The path (for files) or command name (for commands) */
  path: string;
  /** Human-readable description */
  description: string;
  /** For files: how to enumerate the removal set (static list or derived) */
  enumeration?: "static" | "derived";
  /** For files: what source the list was derived from */
  derivedFrom?: string;
}

/**
 * Enumerated constant: every outside-the-home path or command that uninstall must handle.
 *
 * Per docs/dsh-home.md Q6, adding a fourth outside-the-home effect without adding
 * its removal here must fail a test. This is the load-bearing enumeration, not a
 * side effect of code logic.
 *
 * Derived lists (like icon files) are computed at runtime from a manifest source,
 * but the LIST itself is enumerated here so missing the computation is testable.
 */
export const OUTSIDE_THE_HOME_EFFECTS: OutsideTheHomeEffect[] = [
  {
    kind: "file",
    path: "~/.local/bin/thursday",
    description: "Thursday launcher executable",
    enumeration: "static",
  },
  {
    kind: "file",
    path: "~/.local/share/applications/thursday.desktop",
    description: "Desktop entry for Thursday menu integration",
    enumeration: "static",
  },
  {
    kind: "file",
    path: "~/.local/share/icons/hicolor",
    description: "Icon set (hicolor app icons from assets-manifest.json or fallback sizes)",
    enumeration: "derived",
    derivedFrom: "scripts/build-brand-assets.mjs",
  },
  {
    kind: "command",
    path: "update-desktop-database",
    description: "Regenerate desktop database cache",
  },
  {
    kind: "command",
    path: "gtk-update-icon-cache",
    description: "Regenerate GTK icon cache",
  },
];

/**
 * The Thursday-owned top-level entries inside THURSDAY_HOME.
 *
 * Per docs/dsh-home.md Q2/Q7 this split is what makes "unexpected" computable:
 * anything at the top level that is not in this set belongs to the user.
 */
export const KNOWN_THURSDAY_DIRS = ["app", "runtime", "dsh", "state", "cache"] as const;

/**
 * What to do with files inside the home that Thursday does not own.
 *
 * - "preserve": leave them exactly where they are, and remove the Thursday-owned
 *   entries around them. The home directory itself survives, holding only the
 *   user's files.
 * - "delete": remove them along with the rest of the home. Only ever chosen by
 *   an explicit answer from the user.
 *
 * "preserve" is the default because it is the answer that cannot destroy data.
 */
export type UnexpectedFilePolicy = "preserve" | "delete";

/**
 * Resolve THURSDAY_HOME by the rules in docs/dsh-home.md Q1.
 *
 * DELEGATES rather than repeating the rules. These were two independent
 * implementations of one rule, and the difference was not cosmetic: this one
 * applied NO GUARDS, so `THURSDAY_HOME=~/.dsh` resolved happily and uninstall
 * then removed things inside the user's real dsh home. That is the worst place
 * in the codebase for a rule to be duplicated, because uninstall is the only
 * command that deletes. The guarded resolver refuses instead, and refusing to
 * uninstall is always recoverable while deleting the wrong directory is not.
 *
 * The `thursday` CLI checks the same guards before dispatch, but the engine is
 * also a library: E6's guarantee cannot depend on the CLI being its only caller.
 */
export function resolveThursdayHome(): string {
  return resolveGuardedHome().path;
}

/**
 * Expand a leading ~ to an absolute path under the user's home.
 *
 * The slice must drop the separator as well as the tilde. `"~/.local/bin".slice(1)`
 * is `"/.local/bin"`, which is itself absolute, and `resolve(home, "/.local/bin")`
 * discards `home` and yields `/.local/bin` at the filesystem root. That silently
 * pointed the launcher and desktop-entry removals at paths that never exist, so
 * uninstall reported "(file not found, skipping)" and left both files behind.
 */
export function expandPath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Read the assets-manifest.json to find all deployed icon files.
 * Falls back to hardcoded sizes [16, 24, 32, 48, 64, 128, 256] if manifest is missing.
 *
 * Per docs/dsh-home.md Q6: "the removal set must be derived from the same source
 * the installer writes from, or a new icon size ships without a matching removal".
 */
export function getIconRemovalPaths(appHome: string): string[] {
  const manifestPath = join(appHome, "dist", "brand", "assets-manifest.json");

  // Try to read the manifest if it exists
  let manifest: { outputs?: Array<{ path: string; purpose: string }> } | null = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      // Fall through to hardcoded fallback
    }
  }

  const paths: string[] = [];

  if (manifest?.outputs) {
    // Extract hicolor icon paths from the manifest
    for (const output of manifest.outputs) {
      if (output.path?.startsWith("hicolor/")) {
        const fullPath = join(
          homedir(),
          ".local/share/icons/hicolor",
          output.path.replace(/^hicolor\//, ""),
        );
        paths.push(fullPath);
      }
    }
  }

  // Fallback: if no manifest entries, use hardcoded sizes
  if (paths.length === 0) {
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    for (const size of sizes) {
      paths.push(
        resolve(homedir(), `.local/share/icons/hicolor/${size}x${size}/apps/thursday.png`),
      );
    }
  }

  // Always include the scalable SVG
  paths.push(resolve(homedir(), ".local/share/icons/hicolor/scalable/apps/thursday.svg"));

  return paths;
}

/**
 * Walk the top level of THURSDAY_HOME and return any unexpected directories/files.
 *
 * Per docs/dsh-home.md Q7, the known Thursday-owned top-level set is:
 * app/, runtime/, dsh/, state/, cache/.
 */
export function findUnexpectedFiles(thursdayHome: string): string[] {
  const known = new Set<string>(KNOWN_THURSDAY_DIRS);

  if (!existsSync(thursdayHome)) {
    return [];
  }

  const unexpected: string[] = [];
  const entries = readdirSync(thursdayHome, { withFileTypes: true });

  for (const entry of entries) {
    if (!known.has(entry.name)) {
      unexpected.push(join(thursdayHome, entry.name));
    }
  }

  return unexpected;
}

/**
 * Result of an uninstall operation.
 */
export interface UninstallResult {
  /** True if uninstall completed successfully */
  success: boolean;
  /** Messages to display to the user */
  messages: string[];
  /** Error message if something failed */
  error?: string;
  /** List of outside-the-home paths that were removed */
  removedPaths: string[];
  /** Every file inside the home that Thursday does not own, as found before removal */
  unexpectedFiles: string[];
  /**
   * The policy that was actually applied to `unexpectedFiles`. This is the field
   * that makes the printed promise checkable: "preserve" means every path in
   * `unexpectedFiles` is still on disk after a real run.
   */
  unexpectedFilePolicy: UnexpectedFilePolicy;
  /** Unexpected files deliberately left on disk (empty when the policy is "delete") */
  preservedUnexpectedFiles: string[];
  /** Unexpected files deleted on the user's explicit instruction */
  deletedUnexpectedFiles: string[];
  /** True if the THURSDAY_HOME directory itself no longer exists after the run */
  homeRemoved: boolean;
  /** Paths that were NOT touched because they belong to the user */
  preservedPaths: {
    aiScratchDirectory: string;
    tourWorkspace: string;
  };
}

/**
 * Remove the Thursday-owned top-level entries of the home while leaving every
 * path in `keep` exactly where it is. Removes the home directory itself only if
 * nothing is left inside it.
 *
 * Returns the paths actually removed.
 */
function removeHomeAround(thursdayHome: string, keep: string[]): string[] {
  const keepSet = new Set(keep);
  const removed: string[] = [];

  for (const entry of readdirSync(thursdayHome, { withFileTypes: true })) {
    const entryPath = join(thursdayHome, entry.name);
    if (keepSet.has(entryPath)) continue;
    rmSync(entryPath, { recursive: true, force: true });
    removed.push(entryPath);
  }

  // If the user's files were the only thing in there, the home is now empty and
  // leaving an empty directory behind serves nobody.
  if (readdirSync(thursdayHome).length === 0) {
    rmSync(thursdayHome, { recursive: true, force: true });
    removed.push(thursdayHome);
  }

  return removed;
}

/**
 * Core uninstall logic. Removes Thursday from the system.
 *
 * @param dryRun If true, report what would be removed but don't actually remove it
 * @param appHome The app directory (needed for asset manifest, defaults to resolved THURSDAY_HOME/../app)
 * @param unexpectedFilePolicy What to do with files inside the home that Thursday
 *   does not own. Defaults to "preserve"; pass "delete" only after the user has
 *   been shown the list and has explicitly agreed. See `uninstallWithOutput`.
 * @returns UninstallResult with details of what was done
 */
export function uninstall(
  dryRun = false,
  appHome?: string,
  unexpectedFilePolicy: UnexpectedFilePolicy = "preserve",
): UninstallResult {
  const thursdayHome = resolveThursdayHome();
  const baseAppHome = appHome || dirname(thursdayHome);
  const messages: string[] = [];
  const removedPaths: string[] = [];
  const result: UninstallResult = {
    success: true,
    messages,
    removedPaths,
    unexpectedFiles: [],
    unexpectedFilePolicy,
    preservedUnexpectedFiles: [],
    deletedUnexpectedFiles: [],
    homeRemoved: false,
    preservedPaths: {
      aiScratchDirectory: resolve(homedir(), ".ai-scratch"),
      tourWorkspace: resolve(homedir(), ".ai-scratch/trying-out-thursday"),
    },
  };

  // Step 1: Name the files inside the home that Thursday does not own, and say
  // exactly what is about to happen to them. Whichever branch is taken here, the
  // removal in step 2 must do what this text says.
  const unexpected = findUnexpectedFiles(thursdayHome);
  if (unexpected.length > 0) {
    result.unexpectedFiles = unexpected;
    messages.push(`Found ${unexpected.length} file(s) inside Thursday home (not Thursday-owned):`);
    for (const file of unexpected) {
      messages.push(`  - ${file}`);
    }

    if (unexpectedFilePolicy === "preserve") {
      messages.push(
        "These files will NOT be deleted. Please check them and delete manually if desired.",
      );
      messages.push(`  ${thursdayHome} will be kept, holding only the file(s) listed above.`);
    } else {
      messages.push("These files WILL BE DELETED with the Thursday home, as you confirmed.");
    }
  }

  // Step 2: Remove the Thursday home directory, honouring the policy above.
  const preserving = unexpectedFilePolicy === "preserve" && unexpected.length > 0;
  messages.push(
    preserving
      ? `\nRemoving Thursday-owned contents of: ${thursdayHome}`
      : `\nRemoving Thursday home: ${thursdayHome}`,
  );

  if (!dryRun) {
    try {
      if (existsSync(thursdayHome)) {
        if (preserving) {
          const removed = removeHomeAround(thursdayHome, unexpected);
          removedPaths.push(...removed);
          result.preservedUnexpectedFiles = [...unexpected];
        } else {
          rmSync(thursdayHome, { recursive: true, force: true });
          removedPaths.push(thursdayHome);
          result.deletedUnexpectedFiles = [...unexpected];
        }
        result.homeRemoved = !existsSync(thursdayHome);
      } else {
        result.homeRemoved = true;
      }
    } catch (err) {
      result.success = false;
      result.error = `Failed to remove Thursday home: ${err instanceof Error ? err.message : String(err)}`;
      messages.push(`ERROR: ${result.error}`);
      return result;
    }
  } else {
    messages.push(`  (dry run: would remove)`);
    // A dry run removes nothing, so nothing was preserved or deleted yet. Report
    // what the same policy would do on a real run, without claiming it happened.
    if (preserving) {
      result.preservedUnexpectedFiles = [...unexpected];
    }
  }

  // Step 3: Remove outside-the-home files
  const iconPaths = getIconRemovalPaths(baseAppHome);
  const outsideFiles = OUTSIDE_THE_HOME_EFFECTS.filter((e) => e.kind === "file");

  for (const effect of outsideFiles) {
    const expanded = expandPath(effect.path);

    // Special handling for the hicolor icon set (derived list)
    if (effect.path.includes("hicolor")) {
      messages.push(`\nRemoving icon files from ${expanded}:`);
      for (const iconPath of iconPaths) {
        try {
          messages.push(`  - ${iconPath}`);
          if (!dryRun && existsSync(iconPath)) {
            rmSync(iconPath, { force: true });
            removedPaths.push(iconPath);
          }
        } catch (err) {
          messages.push(
            `    (warning: could not remove: ${err instanceof Error ? err.message : String(err)})`,
          );
        }
      }
      continue;
    }

    // Regular static files
    messages.push(`\nRemoving: ${expanded}`);
    if (!dryRun) {
      try {
        if (existsSync(expanded)) {
          // Use rm for directories, unlink for files
          const stat = statSync(expanded);
          if (stat.isDirectory()) {
            rmSync(expanded, { recursive: true, force: true });
          } else {
            rmSync(expanded, { force: true });
          }
          removedPaths.push(expanded);
          messages.push(`  OK`);
        } else {
          messages.push(`  (file not found, skipping)`);
        }
      } catch (err) {
        messages.push(
          `  (warning: could not remove: ${err instanceof Error ? err.message : String(err)})`,
        );
      }
    } else {
      messages.push(`  (dry run: would remove)`);
    }
  }

  // Step 4: Run post-removal commands
  const commands = OUTSIDE_THE_HOME_EFFECTS.filter((e) => e.kind === "command");
  for (const cmd of commands) {
    messages.push(`\nRunning: ${cmd.path}`);
    if (!dryRun) {
      try {
        if (cmd.path === "update-desktop-database") {
          // update-desktop-database updates the desktop database
          const dbPath = resolve(homedir(), ".local/share/applications");
          execSync(`${cmd.path} ${dbPath}`, { stdio: "pipe" });
        } else if (cmd.path === "gtk-update-icon-cache") {
          // gtk-update-icon-cache updates the icon cache
          const iconPath = resolve(homedir(), ".local/share/icons/hicolor");
          execSync(`${cmd.path} ${iconPath}`, { stdio: "pipe" });
        }
        messages.push(`  OK`);
      } catch {
        // Don't fail on command errors; these binaries may not be present
        messages.push(
          `  (command not found or failed; skipping - desktop/icon caches may be stale)`,
        );
      }
    } else {
      messages.push(`  (dry run: would run)`);
    }
  }

  // Step 5: Report preserved user-owned paths
  messages.push(`\nPreserved (user-owned, not touched by Thursday):`);
  messages.push(`  - AI scratch directory: ${result.preservedPaths.aiScratchDirectory}`);
  messages.push(`  - Tour workspace (inside scratch): ${result.preservedPaths.tourWorkspace}`);
  for (const file of result.preservedUnexpectedFiles) {
    messages.push(`  - Your file inside the Thursday home: ${file}`);
  }
  messages.push(`  (These are your files and were left untouched.)`);

  return result;
}

/**
 * Ask the user a yes/no question. Returns true only for an explicit yes.
 */
export type ConfirmPrompt = (question: string) => Promise<boolean>;

/**
 * The default prompt: ask on the terminal. When there is no terminal to ask on,
 * answer "no", because "no" is the answer that cannot destroy the user's data.
 */
async function promptOnTerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Uninstall with user output and exit handling.
 *
 * This is the layer that ASKS. Per docs/dsh-home.md Q7, files the user created
 * inside the Thursday home are named and confirmed, never deleted silently. If
 * there is no terminal to ask on, the answer is "no" and the files are kept.
 *
 * @param dryRun If true, show what would be removed without actually removing it
 * @param confirm Injectable prompt, so the asking path is testable without a TTY
 */
export async function uninstallWithOutput(
  dryRun = false,
  confirm: ConfirmPrompt = promptOnTerminal,
): Promise<void> {
  const thursdayHome = resolveThursdayHome();
  const unexpected = findUnexpectedFiles(thursdayHome);
  let policy: UnexpectedFilePolicy = "preserve";

  if (unexpected.length > 0) {
    console.log(
      `Found ${unexpected.length} file(s) inside the Thursday home that Thursday does not own:`,
    );
    for (const file of unexpected) {
      console.log(`  - ${file}`);
    }

    if (dryRun) {
      console.log(
        "(dry run: a real uninstall would ask whether to delete these. Nothing is removed on a dry run.)",
      );
    } else {
      const alsoDelete = await confirm(
        "Delete these files too? Answering no keeps them and leaves the Thursday home directory in place.",
      );
      policy = alsoDelete ? "delete" : "preserve";
      console.log(
        alsoDelete
          ? "  -> deleting them with the Thursday home."
          : "  -> keeping them; the Thursday home directory will remain, holding only these files.",
      );
    }
  }

  const result = uninstall(dryRun, undefined, policy);

  for (const msg of result.messages) {
    console.log(msg);
  }

  if (result.error) {
    console.error(`\nUninstall failed: ${result.error}`);
    process.exit(1);
  } else if (result.success) {
    console.log(`\n✓ Thursday uninstall ${dryRun ? "dry run " : ""}complete.`);
    if (!dryRun) {
      console.log(
        result.homeRemoved
          ? "Thursday has been removed from your system."
          : `Thursday has been removed from your system. ${thursdayHome} was kept because it still holds your files.`,
      );
    }
  }
}
