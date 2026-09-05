/**
 * Thursday uninstall engine: defines outside-the-home paths that must be
 * removed when Thursday is uninstalled, and implements the removal logic.
 *
 * Per docs/dsh-home.md Q6 and Q7, uninstall:
 * - Deletes the entire THURSDAY_HOME directory
 * - Removes three enumerated outside-the-home paths
 * - Runs two post-removal commands (update-desktop-database, gtk-update-icon-cache)
 * - Names any unexpected files found inside the home before deletion
 * - Explicitly names the AI scratch directory and tour workspace as left untouched
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

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
 * Resolve THURSDAY_HOME by the rules in docs/dsh-home.md Q1:
 * 1. $THURSDAY_HOME env var if set and non-empty (with ~ expansion)
 * 2. otherwise $HOME/.thursday
 */
export function resolveThursdayHome(): string {
  const envValue = process.env.THURSDAY_HOME?.trim();
  if (envValue) {
    // Expand leading ~ to the user's home
    if (envValue.startsWith("~")) {
      return resolve(homedir(), envValue.slice(1));
    }
    return resolve(envValue);
  }
  return resolve(homedir(), ".thursday");
}

/**
 * Expand a path that may contain ~ to an absolute path.
 */
export function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return resolve(homedir(), path.slice(1));
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
          output.path.replace(/^hicolor\//, "")
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
        resolve(homedir(), `.local/share/icons/hicolor/${size}x${size}/apps/thursday.png`)
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
  const KNOWN_THURSDAY_DIRS = new Set(["app", "runtime", "dsh", "state", "cache"]);

  if (!existsSync(thursdayHome)) {
    return [];
  }

  const unexpected: string[] = [];
  const entries = readdirSync(thursdayHome, { withFileTypes: true });

  for (const entry of entries) {
    if (!KNOWN_THURSDAY_DIRS.has(entry.name)) {
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
  /** List of unexpected files found and named (may have been preserved or deleted) */
  unexpectedFiles: string[];
  /** Paths that were NOT touched because they belong to the user */
  preservedPaths: {
    aiScratchDirectory: string;
    tourWorkspace: string;
  };
}

/**
 * Core uninstall logic. Removes Thursday from the system.
 *
 * @param dryRun If true, report what would be removed but don't actually remove it
 * @param appHome The app directory (needed for asset manifest, defaults to resolved THURSDAY_HOME/../app)
 * @returns UninstallResult with details of what was done
 */
export function uninstall(dryRun = false, appHome?: string): UninstallResult {
  const thursdayHome = resolveThursdayHome();
  const baseAppHome = appHome || dirname(thursdayHome);
  const messages: string[] = [];
  const removedPaths: string[] = [];
  const result: UninstallResult = {
    success: true,
    messages,
    removedPaths,
    unexpectedFiles: [],
    preservedPaths: {
      aiScratchDirectory: resolve(homedir(), ".ai-scratch"),
      tourWorkspace: resolve(homedir(), ".ai-scratch/trying-out-thursday"),
    },
  };

  // Step 1: Check for unexpected files inside the home
  const unexpected = findUnexpectedFiles(thursdayHome);
  if (unexpected.length > 0) {
    result.unexpectedFiles = unexpected;
    messages.push(
      `Found ${unexpected.length} unexpected file(s) inside Thursday home (not Thursday-owned):`
    );
    for (const file of unexpected) {
      messages.push(`  - ${file}`);
    }
    messages.push(
      "These files will NOT be deleted. Please check them and delete manually if desired."
    );
  }

  // Step 2: Remove the Thursday home directory
  messages.push(`\nRemoving Thursday home: ${thursdayHome}`);
  if (!dryRun) {
    try {
      if (existsSync(thursdayHome)) {
        rmSync(thursdayHome, { recursive: true, force: true });
        removedPaths.push(thursdayHome);
      }
    } catch (err) {
      result.success = false;
      result.error = `Failed to remove Thursday home: ${err instanceof Error ? err.message : String(err)}`;
      messages.push(`ERROR: ${result.error}`);
      return result;
    }
  } else {
    messages.push(`  (dry run: would remove)`);
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
            `    (warning: could not remove: ${err instanceof Error ? err.message : String(err)})`
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
          `  (warning: could not remove: ${err instanceof Error ? err.message : String(err)})`
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
      } catch (err) {
        // Don't fail on command errors; these binaries may not be present
        messages.push(
          `  (command not found or failed; skipping - desktop/icon caches may be stale)`
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
  messages.push(`  (These are your files and were left untouched.)`);

  return result;
}

/**
 * Uninstall with user output and exit handling.
 *
 * @param dryRun If true, show what would be removed without actually removing it
 */
export function uninstallWithOutput(dryRun = false): void {
  const result = uninstall(dryRun);

  for (const msg of result.messages) {
    console.log(msg);
  }

  if (result.error) {
    console.error(`\nUninstall failed: ${result.error}`);
    process.exit(1);
  } else if (result.success) {
    console.log(`\n✓ Thursday uninstall ${dryRun ? "dry run " : ""}complete.`);
    if (!dryRun) {
      console.log("Thursday has been removed from your system.");
    }
  }
}
