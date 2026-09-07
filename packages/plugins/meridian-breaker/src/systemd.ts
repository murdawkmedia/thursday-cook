/**
 * meridian-breaker/systemd — the LIVE implementations of the two ports.
 *
 * Nothing in this file runs during tests. Every test drives the fakes in
 * meridian-breaker.test.ts against the same interfaces, which is how the live
 * meridian service stays untouched while the ordering contract is proved.
 *
 * The unit name is RESOLVED, never assumed. `meridian.service` is only the
 * first candidate; resolution fails honestly rather than guessing, and the
 * caller then tells the user which two files to delete by hand.
 */

import { execFile } from "node:child_process";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { FileOps, ResolvedService, ServiceControl } from "./remedy";

const run = promisify(execFile);

/** Candidate unit names tried in order before falling back to a scan. */
const CANDIDATES = ["meridian.service"];

/** Units matching this are accepted by the scan. */
const SCAN_PATTERN = /^meridian[^\s]*\.service$/;

const TIMEOUT_MS = 30_000;

async function systemctl(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run("systemctl", ["--user", ...args], { timeout: TIMEOUT_MS, encoding: "utf8" });
}

/** Parse `KEY=VALUE` lines from `systemctl show`. */
function parseShow(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) out.set(line.slice(0, eq), line.slice(eq + 1).trim());
  }
  return out;
}

/** The meridian cache directory, honouring XDG_CACHE_HOME. */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.length > 0
    ? env.XDG_CACHE_HOME
    : `${env.HOME ?? homedir()}/.cache`;
  return `${base}/meridian`;
}

/** The systemd user unit drop-in directory, honouring XDG_CONFIG_HOME. */
function dropInDir(unit: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0
    ? env.XDG_CONFIG_HOME
    : `${env.HOME ?? homedir()}/.config`;
  return `${base}/systemd/user/${unit}.d`;
}

/**
 * Drop-in filename.
 *
 * Two separate requirements, both verified against systemd itself rather than
 * assumed:
 *
 * 1. It must be its OWN file. This machine already carries a hand-written
 *    `~/.config/systemd/user/meridian.service.d/override.conf` full of
 *    load-bearing operator comments; writing into it would destroy them.
 *    `systemctl --user show meridian.service -p DropInPaths` confirms systemd
 *    loads every `*.conf` in that directory, so a second file is picked up.
 *
 * 2. It must sort LAST. systemd.unit(5): drop-in "names are applied in
 *    lexicographic order, regardless of which of the directories they reside
 *    in", and a repeated `Environment=` assignment for the same variable is
 *    won by the later file. An earlier draft of this plugin used
 *    `90-meridian-breaker-session-gc.conf`, believing a numeric prefix meant
 *    high precedence. It does not: `LC_ALL=C sort` puts `90-…` BEFORE
 *    `override.conf`, so had the operator ever set this key there, this
 *    plugin's value would have been silently discarded while the dialog
 *    claimed it had been applied. `zz-` sorts after both, which is what the
 *    dialog actually promises.
 *
 * Exported so the suite can assert the ordering property rather than the
 * literal string.
 */
export const DROP_IN_NAME = "zz-meridian-breaker-session-gc.conf";

/** Live `systemctl --user` service control. */
export const systemdServiceControl: ServiceControl = {
  async resolve(): Promise<ResolvedService | undefined> {
    for (const candidate of CANDIDATES) {
      try {
        const { stdout } = await systemctl(["show", candidate, "-p", "Id", "-p", "LoadState", "-p", "Description"]);
        const props = parseShow(stdout);
        const id = props.get("Id");
        if (props.get("LoadState") === "loaded" && id !== undefined && id.length > 0) {
          const description = props.get("Description");
          return description !== undefined && description.length > 0 ? { unit: id, description } : { unit: id };
        }
      } catch {
        // Fall through to the scan; an unreachable systemctl is reported as unresolved.
      }
    }

    try {
      const { stdout } = await systemctl(["list-unit-files", "--type=service", "--no-legend", "--no-pager"]);
      for (const line of stdout.split("\n")) {
        const unit = line.trim().split(/\s+/)[0];
        if (unit !== undefined && SCAN_PATTERN.test(unit)) return { unit };
      }
    } catch {
      return undefined;
    }
    return undefined;
  },

  async stop(unit: string): Promise<void> {
    await systemctl(["stop", unit]);
  },

  async start(unit: string): Promise<void> {
    await systemctl(["start", unit]);
  },

  async restart(unit: string): Promise<void> {
    await systemctl(["restart", unit]);
  },

  async daemonReload(): Promise<void> {
    await systemctl(["daemon-reload"]);
  },

  async setEnvironmentOverride(unit: string, key: string, value: string): Promise<void> {
    const dir = dropInDir(unit);
    await mkdir(dir, { recursive: true });
    const body =
      `# Written by the dsh meridian-breaker plugin.\n` +
      `# Raises meridian's session-GC pending ceiling so the transcript-ownership\n` +
      `# backlog fills more slowly. This DEFERS the backlog; it does not resolve it.\n` +
      `# Upstream report for the matching error string:\n` +
      `#   https://github.com/rynfar/meridian/issues/895\n` +
      `# Note: meridian reads MERIDIAN_-prefixed names only; the bare\n` +
      `# SESSION_GC_MAX_PENDING that issue #895 names is never consulted.\n` +
      `# Delete this file and run \`systemctl --user daemon-reload\` to revert.\n` +
      `[Service]\n` +
      `Environment=${key}=${value}\n`;
    await writeFile(`${dir}/${DROP_IN_NAME}`, body, { encoding: "utf8", mode: 0o644 });
  },
};

/** Live filesystem operations. A missing file is success, not an error. */
export const nodeFileOps: FileOps = {
  async remove(path: string): Promise<void> {
    // `force: true` makes ENOENT a no-op: the goal is "this file is gone".
    await rm(path, { force: true });
  },
};
