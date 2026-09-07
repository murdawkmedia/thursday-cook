/**
 * meridian-breaker/remedy — the ordered repair, behind injectable ports.
 *
 * The order is load-bearing:
 *   1. stop the meridian service
 *   2. delete ~/.cache/meridian/session-gc.json and ~/.cache/meridian/sessions.json
 *   3. start the meridian service
 *   4. (the caller clears the latch and resumes every paused chain)
 *
 * Deleting before stopping is a RACE, not a style preference: meridian holds
 * both files open and rewrites them continuously, so a delete under a live
 * daemon can be undone by the next flush. That leaves the user told-they're-
 * fixed and still broken. Every path below either performs step 1 first or
 * deletes nothing at all.
 *
 * Two consequences of that rule, both deliberate:
 * - If the service cannot be RESOLVED we delete nothing and say so. A wipe with
 *   no way to stop the writer is exactly the race we are avoiding.
 * - If the stop FAILS we delete nothing, for the same reason.
 * - If a delete fails after a successful stop we still START the service again
 *   before reporting failure. Leaving meridian stopped would be a worse outcome
 *   than the backlog we were asked to clear.
 *
 * Every effect goes through {@link ServiceControl} and {@link FileOps} so tests
 * drive fakes and the live service is never touched.
 */

/** The two files the wipe removes, in the order they are removed. */
export const CACHE_FILES = ["session-gc.json", "sessions.json"] as const;

/** A resolved systemd unit the plugin is willing to control. */
export interface ResolvedService {
  /** Exact unit id, e.g. `meridian.service`. Never hardcoded — always resolved. */
  readonly unit: string;
  /** Human-readable description, for the prompt. */
  readonly description?: string;
}

/** Service lifecycle port. The live implementation shells out to `systemctl --user`. */
export interface ServiceControl {
  /** Locate the meridian unit. Returns undefined when it cannot be found. */
  resolve(): Promise<ResolvedService | undefined>;
  stop(unit: string): Promise<void>;
  start(unit: string): Promise<void>;
  /** Write a unit drop-in setting one Environment= key, then reload the daemon. */
  setEnvironmentOverride(unit: string, key: string, value: string): Promise<void>;
  daemonReload(): Promise<void>;
  restart(unit: string): Promise<void>;
}

/** Filesystem port. The live implementation unlinks; ENOENT is not an error. */
export interface FileOps {
  /** Remove a file. Must resolve (not reject) when the file is already absent. */
  remove(path: string): Promise<void>;
}

/** Where the meridian cache lives; injectable so tests never name the real directory. */
export interface RemedyPorts {
  readonly service: ServiceControl;
  readonly files: FileOps;
  /** Absolute path of the meridian cache directory. */
  readonly cacheDir: string;
}

/** Outcome of {@link runRemedy}. */
export type RemedyResult =
  /** Stopped, wiped, started. The caller may resume paused chains. */
  | {
      readonly kind: "done";
      readonly unit: string;
      readonly deleted: readonly string[];
      readonly steps: readonly string[];
    }
  /**
   * The unit could not be resolved. NOTHING was stopped and NOTHING was
   * deleted. `paths` names the two files for the user to remove by hand.
   */
  | { readonly kind: "unresolved-service"; readonly paths: readonly string[]; readonly steps: readonly string[] }
  /** Something failed. `steps` is the journal of what actually happened. */
  | {
      readonly kind: "failed";
      readonly reason: string;
      readonly steps: readonly string[];
      /** True when the wipe never ran, so the on-disk state is unchanged. */
      readonly deletedNothing: boolean;
    };

/** Join a cache directory and a file name without pulling in node:path. */
function join(dir: string, file: string): string {
  return dir.endsWith("/") ? `${dir}${file}` : `${dir}/${file}`;
}

/** The two absolute cache paths, for messaging and for the wipe. */
export function cachePaths(cacheDir: string): string[] {
  return CACHE_FILES.map((f) => join(cacheDir, f));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Perform the repair in the required order.
 *
 * @param ports - service, filesystem, and cache directory.
 * @returns what happened, including an ordered `steps` journal. The journal is
 *   the ordering contract: `stop:<unit>` always precedes every `delete:<path>`,
 *   and `start:<unit>` always follows them.
 */
export async function runRemedy(ports: RemedyPorts): Promise<RemedyResult> {
  const steps: string[] = [];
  const paths = cachePaths(ports.cacheDir);

  // ── Resolve ────────────────────────────────────────────────────────────
  let resolved: ResolvedService | undefined;
  try {
    steps.push("resolve");
    resolved = await ports.service.resolve();
  } catch (error) {
    steps.push(`resolve-failed:${describe(error)}`);
    return { kind: "unresolved-service", paths, steps };
  }
  if (resolved === undefined) {
    steps.push("resolve-missing");
    // Deliberately no delete: with no way to stop the writer, a wipe is a race.
    return { kind: "unresolved-service", paths, steps };
  }
  const unit = resolved.unit;

  // ── 1. stop ────────────────────────────────────────────────────────────
  try {
    await ports.service.stop(unit);
    steps.push(`stop:${unit}`);
  } catch (error) {
    steps.push(`stop-failed:${unit}`);
    return {
      kind: "failed",
      reason: `could not stop ${unit}: ${describe(error)}`,
      steps,
      deletedNothing: true,
    };
  }

  // ── 2. delete (only ever after a successful stop) ──────────────────────
  const deleted: string[] = [];
  let deleteError: unknown;
  for (const path of paths) {
    try {
      await ports.files.remove(path);
      steps.push(`delete:${path}`);
      deleted.push(path);
    } catch (error) {
      steps.push(`delete-failed:${path}`);
      deleteError = error;
      break;
    }
  }

  // ── 3. start (always, even when the wipe failed midway) ────────────────
  try {
    await ports.service.start(unit);
    steps.push(`start:${unit}`);
  } catch (error) {
    steps.push(`start-failed:${unit}`);
    return {
      kind: "failed",
      reason: `wiped the cache but could not start ${unit} again: ${describe(error)}`,
      steps,
      deletedNothing: deleted.length === 0,
    };
  }

  if (deleteError !== undefined) {
    return {
      kind: "failed",
      reason: `could not delete the meridian cache: ${describe(deleteError)}`,
      steps,
      deletedNothing: deleted.length === 0,
    };
  }

  return { kind: "done", unit, deleted, steps };
}

// ── Second, separate mitigation ──────────────────────────────────────────

/**
 * The env var that actually raises the backlog ceiling.
 *
 * Issue #895 names the setting `SESSION_GC_MAX_PENDING`, but that BARE name is
 * never read. meridian resolves the suffix against two prefixes:
 *
 *   @rynfar/meridian@1.66.0 dist/cli-m9wqgk1q.js:12-14
 *     env(suffix) => process.env[`MERIDIAN_${suffix}`]
 *                 ?? process.env[`CLAUDE_PROXY_${suffix}`]
 *   dist/cli-nzvbaqjp.js:35591
 *     maxPending: Math.max(1, envInt("SESSION_GC_MAX_PENDING", 256))
 *
 * So writing `Environment=SESSION_GC_MAX_PENDING=2048` into the unit would be a
 * silent no-op — the ceiling would stay at the compiled-in default. The
 * prefixed name is the one that works.
 */
export const CEILING_KEY = "MERIDIAN_SESSION_GC_MAX_PENDING";

/** The bare name as issue #895 writes it. Recorded only to explain why it is not used. */
export const CEILING_KEY_AS_REPORTED_UPSTREAM = "SESSION_GC_MAX_PENDING";

/** meridian's compiled-in default ceiling (dist/cli-nzvbaqjp.js:35591, DEFAULT_MAX_PENDING = 256). */
export const CEILING_CURRENT_DEFAULT = "256";

/** The raised value issue #895 reports. */
export const CEILING_DEFAULT = "2048";

/** Outcome of {@link runCeilingMitigation}. */
export type CeilingResult =
  | { readonly kind: "done"; readonly unit: string; readonly value: string; readonly steps: readonly string[] }
  | { readonly kind: "unresolved-service"; readonly steps: readonly string[] }
  | { readonly kind: "failed"; readonly reason: string; readonly steps: readonly string[] };

/**
 * Raise the backlog ceiling persistently: one unit drop-in, a daemon-reload,
 * and a restart so the new environment takes effect.
 *
 * This is a SEPARATE operation from {@link runRemedy} on purpose. The wipe
 * clears the backlog now; this only makes the backlog take longer to fill. It
 * defers the problem rather than solving it, and the two must not be folded
 * together or a user who takes one is silently given the other.
 *
 * @param ports - service control and (unused) filesystem ports.
 * @param value - the ceiling to set; defaults to {@link CEILING_DEFAULT}.
 */
export async function runCeilingMitigation(
  ports: Pick<RemedyPorts, "service">,
  value: string = CEILING_DEFAULT,
): Promise<CeilingResult> {
  const steps: string[] = [];
  let resolved: ResolvedService | undefined;
  try {
    steps.push("resolve");
    resolved = await ports.service.resolve();
  } catch (error) {
    steps.push(`resolve-failed:${describe(error)}`);
    return { kind: "unresolved-service", steps };
  }
  if (resolved === undefined) {
    steps.push("resolve-missing");
    return { kind: "unresolved-service", steps };
  }
  const unit = resolved.unit;

  try {
    await ports.service.setEnvironmentOverride(unit, CEILING_KEY, value);
    steps.push(`override:${unit}:${CEILING_KEY}=${value}`);
    await ports.service.daemonReload();
    steps.push("daemon-reload");
    await ports.service.restart(unit);
    steps.push(`restart:${unit}`);
  } catch (error) {
    return { kind: "failed", reason: describe(error), steps };
  }

  return { kind: "done", unit, value, steps };
}
