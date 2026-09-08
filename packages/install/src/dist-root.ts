import { dirname, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The Thursday distribution root: the tree holding the files being installed.
 *
 * `thursday install` runs from a checkout, a global npm prefix, a pnpm link
 * and a container image, and each of those puts the distribution somewhere
 * different. A checkout path or `process.cwd()` is right in exactly one of
 * those four, so neither is the answer. This module is the one answer: it
 * resolves the root from the install engine's OWN module location — the same
 * shape that made `@trythursday/blocks`' `blocksDir` work — and everything
 * else asks it. There must not be a second spelling of this.
 *
 * The walk goes UP from the module file looking for the distribution markers,
 * rather than assuming a fixed depth, because the module's own depth differs:
 * under vitest it is `packages/install/src/dist-root.ts`, in the built engine
 * it is bundled into `packages/install/dist/index.js`. A fixed `../..`
 * is correct in exactly one of those two and silently wrong in the other.
 * `realpathSync` runs first so a pnpm link — a symlink to the checkout —
 * resolves to the checkout rather than to the store path.
 */
export const DIST_ROOT_MARKERS = ["pnpm-workspace.yaml", "config/AGENTS.md"] as const;

/**
 * Find the distribution root above `startDir`.
 *
 * Every marker must be present; the first ancestor (starting with `startDir`
 * itself) holding all of them wins. Throws naming the directory the search
 * started from and the markers it looked for, because a failed search means
 * the engine is running from a layout nobody taught it — a packaging bug —
 * and "source not found" three calls later would misdiagnose it as a block
 * bug.
 */
export function findDistributionRoot(startDir: string): string {
  let dir = resolve(realpathSync(startDir));
  for (;;) {
    const missing = DIST_ROOT_MARKERS.filter((m) => !existsSync(resolve(dir, m)));
    if (missing.length === 0) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Thursday distribution root not found above ${startDir}: ` +
          `no ancestor holds all of ${DIST_ROOT_MARKERS.join(", ")} ` +
          `(missing ${missing.join(", ")} at the filesystem root). ` +
          `The install engine resolves its sources from its own module location, ` +
          `so this means the distribution was packaged without its marker files.`,
      );
    }
    dir = parent;
  }
}

/**
 * The distribution root for this running engine.
 *
 * Computed once, from this module's own location. Prefer threading it as an
 * argument (see `InstallOptions.distRoot`) in code that must be testable;
 * read this singleton only at the boundary where no caller passes one.
 */
export const distributionRoot: string = findDistributionRoot(
  dirname(fileURLToPath(import.meta.url)),
);

/**
 * THE STAGING DECISION (ticket I9), recorded where it cannot drift from the
 * code that implements it.
 *
 * `KNOWN_THURSDAY_DIRS` lists an `app` directory, which suggested staging the
 * distribution into `$THURSDAY_HOME/app` first and copying from there. That
 * was NOT done, for three reasons:
 *
 * 1. Nothing would read the staged copy. Uninstall removes the home wholesale
 *    — a stronger guarantee than diffing against a staged copy — and drift
 *    detection is unimplemented (`detectBlockStatus` never returns
 *    `installed-but-drifted`), so the "compare against a copy that cannot
 *    move" benefit has no consumer.
 * 2. A staged copy is a second truth. The moment the checkout moves on, the
 *    staged tree and the distribution disagree about what "install" means,
 *    and every later decision (re-install? diff? refresh the stage?) is a new
 *    ticket. Reading the distribution directly always installs the files the
 *    user asked for.
 * 3. The cost is real: a second copy of every file, including the whole
 *    `packages/plugins` tree, per Thursday home.
 *
 * Blocks therefore read from the package directly, and the base is named
 * `dist` — the distribution — rather than `app`, so that IF staging is ever
 * adopted it arrives as a deliberate rename rather than a silent redefinition
 * of what `app` means. `app` stays reserved in `KNOWN_THURSDAY_DIRS`.
 */
export const DIST_SOURCE_BASE_NAME = "dist" as const;
