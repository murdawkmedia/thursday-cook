import { spawnSync } from "node:child_process";
import { relative } from "node:path";

export interface DriftCheckResult {
  /** `true` when git reported no difference for the tracked outputs. */
  clean: boolean;
  /** Output paths git tracks; only these can show drift. */
  tracked: string[];
  /** Output paths git does not track (ignored or never added). */
  untracked: string[];
  /** `git diff` output when drift was found, otherwise "". */
  diff: string;
  /** Human-readable one-line summary. */
  summary: string;
}

function git(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: run.status ?? 1,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
  };
}

/**
 * The `--check` mode carried over from dotfiles-ai/build.mjs: rebuild, then
 * ask git whether the freshly built outputs differ from what is committed.
 * That repository commits its bundles, so a stale committed bundle is a real
 * defect this catches in CI.
 *
 * Changed from the original, deliberately. The original ran
 * `git diff --exit-code -- <globs>` and treated a zero exit as "no drift". If
 * the outputs are not tracked — and this workspace's .gitignore ignores
 * `dist/` and `lib/` — git diff has nothing to compare and exits zero, so the
 * check passes without checking anything. This version partitions the paths
 * with `git ls-files` first and reports "vacuous" when nothing is tracked,
 * so an un-committed-bundles repository cannot get a false green.
 */
export function checkDrift(outfiles: readonly string[], cwd: string): DriftCheckResult {
  const paths = [...new Set(outfiles)].map((p) => relative(cwd, p) || p).sort();
  if (paths.length === 0) {
    return {
      clean: true,
      tracked: [],
      untracked: [],
      diff: "",
      summary: "build check: nothing to check (no outputs declared)",
    };
  }

  const listed = git(["ls-files", "--error-unmatch", "--", ...paths], cwd);
  const tracked = listed.stdout.split("\n").filter((line) => line.length > 0);
  const trackedSet = new Set(tracked);
  const untracked = paths.filter((p) => !trackedSet.has(p));

  if (tracked.length === 0) {
    return {
      clean: true,
      tracked,
      untracked,
      diff: "",
      summary:
        `build check: vacuous — none of the ${paths.length} output(s) are tracked by git, ` +
        "so there is no committed bundle to drift from",
    };
  }

  const diffed = git(["diff", "--exit-code", "--", ...tracked], cwd);
  if (diffed.status === 0) {
    return {
      clean: true,
      tracked,
      untracked,
      diff: "",
      summary:
        `build check: no drift (${tracked.length} tracked output(s)` +
        (untracked.length > 0 ? `, ${untracked.length} untracked and skipped` : "") +
        ")",
    };
  }
  return {
    clean: false,
    tracked,
    untracked,
    diff: diffed.stdout,
    summary:
      "build check FAILED: committed bundles differ from a fresh build. " +
      "Rebuild and commit the outputs.",
  };
}
