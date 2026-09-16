import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import * as fsDefault from "node:fs";
import * as fsPromisesDefault from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { Block } from "./loader";
import type { DetectStep, PathBase, Step } from "./actions";
import { rowPresentSatisfied } from "./actions";
import { distributionRoot } from "./dist-root";
import { orderBlocks } from "./patch";

/**
 * Filesystem API that can be injected for testing.
 * Allows passing memfs volume in tests, real fs in production.
 */
export interface FilesystemAPI {
  existsSync: typeof fsDefault.existsSync;
  readFileSync: typeof fsDefault.readFileSync;
  writeFileSync: typeof fsDefault.writeFileSync;
  mkdirSync: typeof fsDefault.mkdirSync;
  /**
   * Resolve symlinks. `patch-file-exact` refuses to write a file whose real
   * path leaves `$THURSDAY_HOME`: without this call a symlink planted in the
   * runtime tree redirects the patch onto an arbitrary file.
   */
  realpathSync: typeof fsDefault.realpathSync;
  /**
   * Rename. Used to break hardlinks: a fresh temp file renamed over the target
   * replaces the directory entry, so every other link to the old inode — a
   * pnpm store entry, another install — keeps the bytes it had.
   */
  renameSync: typeof fsDefault.renameSync;
  /** Unlink. Used to clean up the temp file when a guarded write fails. */
  unlinkSync: typeof fsDefault.unlinkSync;
  /** Directory listing. Used by `copy-tree`'s content-comparison walk. */
  readdirSync: typeof fsDefault.readdirSync;
  /** Stat. Used by `copy-tree`'s walk to tell a directory from a file. */
  statSync: typeof fsDefault.statSync;
  promises: {
    readFile: typeof fsPromisesDefault.readFile;
    writeFile: typeof fsPromisesDefault.writeFile;
    mkdir: typeof fsPromisesDefault.mkdir;
    cp: typeof fsPromisesDefault.cp;
  };
}

/**
 * A problem encountered while planning or executing an install.
 */
export interface InstallProblem {
  block?: string;
  step?: number;
  message: string;
}

export type DetectionStatus = "not-installed" | "installed-and-current" | "installed-but-drifted";

export interface BlockDetection {
  blockId: string;
  status: DetectionStatus;
  shouldInstall: boolean;
  reason: string;
}

export interface PlannedStep {
  blockId: string;
  blockRationale: string;
  index: number;
  step: Step;
  dryRun: boolean;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
  problems: InstallProblem[];
}

export interface StepResult {
  step: PlannedStep;
  changed: boolean;
  output: string;
}

export interface InstallResult {
  steps: StepResult[];
  anyChanged: boolean;
  problems: InstallProblem[];
}

export interface InstallOptions {
  thursdayHome?: string;
  dryRun?: boolean;
  quiet?: boolean;
  fs?: FilesystemAPI;
  /**
   * Override the Thursday distribution root `copy-tree` sources with
   * `base: dist` (the default) resolve against. Production leaves this unset
   * so the root comes from `dist-root.ts` — the one module that owns the
   * answer — and tests set it to point at a fixture tree.
   */
  distRoot?: string;
}

export interface ResolvedThursdayHome {
  path: string;
  dshPath: string;
}

/**
 * Resolve THURSDAY_HOME according to dsh-home.md Q1 rules and guards.
 */
export function resolveThursdayHome(
  env?: Record<string, string>,
  homeDir?: string,
): ResolvedThursdayHome {
  const environment = env ?? process.env;
  const home = homeDir ?? homedir();

  let thursdayHome = environment.THURSDAY_HOME?.trim() ?? "";
  if (!thursdayHome) {
    thursdayHome = join(home, ".thursday");
  } else {
    if (thursdayHome.startsWith("~/")) {
      thursdayHome = join(home, thursdayHome.slice(2));
    } else if (thursdayHome === "~") {
      thursdayHome = home;
    }
  }

  thursdayHome = resolve(thursdayHome);

  // Guard 1: refuse if overlaps with user's ~/.dsh
  const userDshHome = environment.DSH_HOME?.trim() ?? join(home, ".dsh");
  const resolvedUserDsh = resolve(userDshHome);
  if (
    thursdayHome === resolvedUserDsh ||
    thursdayHome.startsWith(resolvedUserDsh + "/") ||
    resolvedUserDsh.startsWith(thursdayHome + "/")
  ) {
    throw new Error(
      `THURSDAY_HOME cannot overlap with user's dsh home: ` +
        `resolved THURSDAY_HOME=${thursdayHome}, user DSH_HOME=${resolvedUserDsh}`,
    );
  }

  // Guard 2: refuse if starts with /mnt/ (WSL rule)
  if (thursdayHome.startsWith("/mnt/")) {
    throw new Error(
      `THURSDAY_HOME cannot be under /mnt/ (WSL DrvFs): ` +
        `resolved THURSDAY_HOME=${thursdayHome}`,
    );
  }

  const dshPath = join(thursdayHome, "dsh");
  return { path: thursdayHome, dshPath };
}

/**
 * Resolve the root an action's relative paths hang off.
 *
 * `home` is the Thursday home; `dsh` is the dsh home inside it. Every action
 * that takes a path declares its own default in `actions.ts`, so this function
 * only turns that word into a directory.
 */
export function baseDirFor(base: PathBase, dshPath: string, thursdayHome: string): string {
  return base === "home" ? thursdayHome : dshPath;
}

/** How many trailing lines of a failed command's stderr to quote. */
const COMMAND_FAILURE_STDERR_LINES = 8;

/**
 * Turn a failed command into a message that says WHY, not just that it failed.
 *
 * `Command failed with exit code 1` is what execa's own message says, and on
 * its own it is undiagnosable: it names neither the reason nor anything the
 * reader can act on. The tool almost always said something useful on stderr
 * first — "unable to open database file", "ENOTFOUND registry.npmjs.org",
 * "404 Not Found" — and that line is the whole diagnosis.
 *
 * The tail is quoted rather than the head, because build tools print progress
 * first and the failure last. Blank lines are dropped so a tool that pads its
 * output does not push the cause out of the window.
 */
export function describeCommandFailure(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const stderr = (err as { stderr?: unknown } | null)?.stderr;
  if (typeof stderr !== "string" || stderr.trim() === "") return base;

  const lines = stderr
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return base;

  const tail = lines.slice(-COMMAND_FAILURE_STDERR_LINES);
  const elided = lines.length - tail.length;
  const prefix = elided > 0 ? `(${elided} earlier stderr line(s) omitted)\n` : "";
  return `${base}\n${prefix}${tail.map((line) => `    ${line}`).join("\n")}`;
}

/**
 * Turn pnpm's own `allowBuilds` placeholders into real `true` values, and
 * report which packages were changed.
 *
 * When pnpm refuses to run a package's build scripts it writes the package
 * into the working directory's `pnpm-workspace.yaml` as a placeholder STRING:
 *
 *     allowBuilds:
 *       '@deepseek-ai/dsh-subprocess-local': set this to true or false
 *       koffi: set this to true or false
 *
 * A string is neither `true` nor `false` to pnpm, so it is read as
 * not-allowed and the next run fails identically. Rewriting those five values
 * as `true` by hand took the runtime install from exit 1 to exit 0 with every
 * build script running, which is what this reproduces.
 *
 * Returns the names it changed, EMPTY when there was nothing to change. An
 * empty return is what tells the caller this was a different failure wearing
 * the same exit code, so it must not be conflated with success.
 */
export function normaliseIgnoredBuilds(
  cwd: string,
  dryRun: boolean,
  // Only the three calls this needs, so the injected FilesystemAPI satisfies
  // it as readily as node:fs does.
  fs: {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: "utf8") => string;
    writeFileSync: (p: string, data: string, enc: "utf8") => void;
  } = fsDefault as never,
): string[] {
  const workspacePath = join(cwd, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspacePath)) return [];

  let doc: any;
  try {
    doc = parseYaml(fs.readFileSync(workspacePath, "utf8") as string) || {};
  } catch {
    // A malformed workspace file is a real problem, but it is NOT this one,
    // and rewriting a file we could not parse would destroy it.
    return [];
  }

  const allow = doc.allowBuilds;
  if (allow === null || typeof allow !== "object" || Array.isArray(allow)) return [];

  const changed: string[] = [];
  for (const key of Object.keys(allow as Record<string, unknown>)) {
    if (typeof (allow as Record<string, unknown>)[key] !== "boolean") {
      (allow as Record<string, unknown>)[key] = true;
      changed.push(key);
    }
  }

  if (changed.length > 0 && !dryRun) {
    fs.writeFileSync(workspacePath, stringifyYaml(doc), "utf8");
  }
  return changed;
}

/**
 * Every `@deepseek-ai/dsh*` version the runtime install resolved, so the
 * profile can be pinned to the same set.
 *
 * THE PROBLEM IT SOLVES. Third-party plugins declare ranges the registry
 * cannot satisfy: dsh-tool-time depends on dsh-tools, which depends on
 * `@deepseek-ai/dsh-invariants@^0.1.0`, and that package's `latest` tag still
 * points at an 0.0.1 stub while its 0.1.x line lives only on `alpha` and
 * `next`. Every pnpm-add into a fresh profile then fails with
 * ERR_PNPM_NO_MATCHING_VERSION naming a different family member. An existing
 * machine never shows this: its profile resolved long ago and has a lockfile.
 *
 * WHY DERIVED. The runtime has just resolved the whole family consistently, so
 * its versions are the correct target by construction and cannot drift from
 * the runtime pin when that pin moves. Writing them down would need 231 lines
 * of hand-maintained version numbers.
 *
 * WHY ONLY `dsh*`. The @deepseek-ai scope is NOT homogeneous: it also holds
 * cordis@4.0.2, cosmokit@1.8.3, schemastery@3.18.2 and
 * node-addon-landlock-run@0.1.1, which are ordinary released packages on
 * entirely different version lines. An earlier attempt overrode the whole
 * scope and broke immediately on cordis, pinning it to a version that does not
 * exist. The prefix is the boundary between "the dsh release train" and
 * "libraries that happen to share the scope".
 */
export function collectRuntimeOverrides(
  runtimeDir: string,
  fs: {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: "utf8") => string;
    readdirSync: (p: string) => string[];
  },
): Record<string, string> {
  const out: Record<string, string> = {};
  const pnpmDir = join(runtimeDir, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) return out;

  let entries: string[];
  try {
    entries = fs.readdirSync(pnpmDir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.startsWith("@deepseek-ai+dsh")) continue;
    const scopeDir = join(pnpmDir, entry, "node_modules", "@deepseek-ai");
    if (!fs.existsSync(scopeDir)) continue;

    let names: string[];
    try {
      names = fs.readdirSync(scopeDir);
    } catch {
      continue;
    }

    for (const shortName of names) {
      const manifest = join(scopeDir, shortName, "package.json");
      if (!fs.existsSync(manifest)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (typeof parsed.name !== "string" || typeof parsed.version !== "string") continue;
        if (!parsed.name.startsWith("@deepseek-ai/dsh")) continue;
        // First wins. A family member resolved at two versions in one runtime
        // tree would make the override arbitrary, and picking silently is
        // worse than being consistent about which one is taken.
        if (out[parsed.name] === undefined) out[parsed.name] = parsed.version;
      } catch {
        continue;
      }
    }
  }

  return out;
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/**
 * What one exact-string replacement is, relative to the text in front of it.
 *
 * `applied` is the state that makes a patch step idempotent, and it is decided
 * by the presence of the `replace` text rather than by the absence of the
 * `find` text: a block whose `find` is a substring of its own `replace` would
 * otherwise re-match its own output for ever and append the replacement on
 * every run. `ambiguous` and `missing` are both failures, kept apart because
 * they mean different things to whoever reads the error — several matches is a
 * `find` that is not specific enough, no match at all is version skew.
 */
export type ReplacementState = "applied" | "pending" | "ambiguous" | "missing";

/** Classify one replacement against the text it would be applied to. */
export function classifyReplacement(
  text: string,
  replacement: { find: string; replace: string },
): ReplacementState {
  const findCount = countOccurrences(text, replacement.find);
  const replaceCount = countOccurrences(text, replacement.replace);
  if (replaceCount >= 1 && (findCount === 0 || replacement.replace.includes(replacement.find))) {
    return "applied";
  }
  if (findCount === 1) return "pending";
  if (findCount > 1) return "ambiguous";
  return "missing";
}

/** One `patch-file-exact` step, resolved and classified but not yet written. */
export interface PatchFileExactPreview {
  /** The target as the step spells it, for messages. */
  target: string;
  /** The resolved target after `realpath`: the file that would actually be written. */
  targetPath: string;
  /** Where the untouched original is kept, or would be. */
  origPath: string;
  /** True when this run is the one that would store the original. */
  storesOriginal: boolean;
  /** Indices of replacements already present in the file. */
  alreadyApplied: number[];
  /** Indices of replacements this run would apply. */
  pending: number[];
  /** The bytes now on disk. */
  currentContent: string;
  /** The bytes after this run; identical to `currentContent` when nothing is pending. */
  nextContent: string;
  /** Whether this run would change anything. */
  changed: boolean;
  /** The step's report line. Computed from the pre-state, so a dry run and an apply print the same thing. */
  output: string;
}

/**
 * Resolve, guard and classify a `patch-file-exact` step without writing.
 *
 * This is the whole decision procedure of the action: guards 1 and 2 (resolve,
 * realpath-under-home), the apply-all-or-nothing classification, and the text
 * the step will report. The executor calls it for a dry run and for an apply
 * alike and only the writes are conditional, which is what makes the dry run's
 * `changed` flag and output the same as the apply's rather than a guess.
 *
 * Throws when the target is absent, escapes the Thursday home, or when any
 * replacement is neither applied nor matchable exactly once — before anything
 * has been written, so a failed `find` cannot leave a half-patched file.
 */
/**
 * Resolve a patch target containing exactly one `*` segment to exactly one
 * file, and refuse on zero or several.
 *
 * WHY A GLOB IS NEEDED AT ALL. pnpm stores a package under a directory whose
 * name carries the version AND a content hash of its peer set, for example
 *
 *   .pnpm/@deepseek-ai+dsh-sandbox@0.1.5-rc.2_@deepseek-ai+cordis@4.0.2_...d0c2c49/
 *
 * That hash is not predictable from anything a block can state, and it changes
 * whenever a peer moves. The old literal target assumed pnpm would NEST the
 * package under its parent
 * (runtime/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-sandbox),
 * which pnpm does not do: only the direct dependency is hoisted, and
 * everything else lives in .pnpm behind a hashed directory. The step failed
 * for that reason alone, not because anything was missing -- the patch's find
 * string is still byte-identical to the shipped source at dsh 0.1.5-rc.2.
 *
 * REFUSING ON SEVERAL MATCHES IS THE POINT. Two matches means two copies of
 * the package are installed at different versions, and patching an arbitrary
 * one of them would produce a half-patched tree whose behaviour depends on
 * which copy the resolver happens to load. That is the failure this refusal is
 * here to prevent, so it reports every match rather than picking one.
 */
export function resolveSingleGlob(base: string, pattern: string, fs: FilesystemAPI): string {
  const star = pattern.indexOf("*");
  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);
  if (tail.includes("*")) {
    throw new Error(
      `patch target may contain at most one "*": ${pattern}. More than one wildcard makes the ` +
        `match ambiguous, and an ambiguous patch target is how a half-patched tree happens.`,
    );
  }

  // The wildcard stands for ONE directory entry, so split the head at the last
  // separator: everything before it is a real directory to list.
  const lastSep = head.lastIndexOf("/");
  const dirPart = lastSep === -1 ? "" : head.slice(0, lastSep);
  const prefix = lastSep === -1 ? head : head.slice(lastSep + 1);
  const searchDir = dirPart === "" ? base : join(base, dirPart);

  if (!fs.existsSync(searchDir)) {
    throw new Error(
      `patch target not found: ${join(base, pattern)}. The directory ${searchDir} does not ` +
        `exist, so the step that installs it did not run to completion.`,
    );
  }

  const entries = (fs.readdirSync(searchDir) as string[]).filter((e) => e.startsWith(prefix));
  const matches = entries
    .map((entry) => join(searchDir, entry) + tail)
    .filter((candidate) => fs.existsSync(candidate));

  if (matches.length === 0) {
    throw new Error(
      `patch target not found: no entry in ${searchDir} starting with "${prefix}" has ` +
        `"${tail}". patch-file-exact requires the file to exist; a missing target means the ` +
        `step that installs it did not run to completion.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `patch target is ambiguous: ${matches.length} files match ${pattern} — ${matches.join(", ")}. ` +
        `Several matches means the package is installed more than once, and patching one copy ` +
        `leaves a tree whose behaviour depends on which copy the resolver loads.`,
    );
  }
  return matches[0];
}

export function previewPatchFileExact(
  step: Extract<Step, { action: "patch-file-exact" }>,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): PatchFileExactPreview {
  // Guard 1: resolve the target, and fail loudly when it is not there. A
  // missing file means the install that should have created it did not finish;
  // aidos's script prints "nothing to patch" and exits 0 here, which is the
  // silent success docs/fs-sandbox.md tells Thursday not to inherit.
  const base = baseDirFor(step.base, dshPath, thursdayHome);
  const targetPath = step.target.includes("*")
    ? resolveSingleGlob(base, step.target, fs)
    : join(base, step.target);
  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `patch target not found: ${targetPath}. patch-file-exact requires the file to exist; ` +
        `a missing target means the step that installs it did not run to completion.`,
    );
  }

  // Guard 2: realpath it and refuse unless the result is still inside the
  // Thursday home. This is the guard that stops a symlink in the runtime tree
  // from redirecting the patch onto a file Thursday does not own.
  const realTarget = fs.realpathSync(targetPath) as string;
  const realHome = fs.existsSync(thursdayHome)
    ? (fs.realpathSync(thursdayHome) as string)
    : resolve(thursdayHome);
  if (realTarget !== realHome && !realTarget.startsWith(realHome + sep)) {
    throw new Error(
      `refusing to patch ${step.target}: it resolves to ${realTarget}, which is outside ` +
        `THURSDAY_HOME (${realHome}). Thursday patches its own copy of dsh and nothing else.`,
    );
  }

  const currentContent = fs.readFileSync(realTarget, "utf8") as string;

  // Classify every replacement against the text as it will be when that
  // replacement's turn comes, so an ordered patch whose later step depends on
  // an earlier one is judged on the right bytes. Nothing is written until the
  // whole list has passed.
  const alreadyApplied: number[] = [];
  const pending: number[] = [];
  let nextContent = currentContent;
  step.replacements.forEach((replacement, i) => {
    const state = classifyReplacement(nextContent, replacement);
    switch (state) {
      case "applied":
        alreadyApplied.push(i);
        return;
      case "pending":
        pending.push(i);
        nextContent = nextContent.replace(replacement.find, replacement.replace);
        return;
      case "ambiguous":
        throw new Error(
          `replacement ${i} matches ${countOccurrences(nextContent, replacement.find)} times in ` +
            `${step.target}; the find text must appear exactly once. Nothing was written.`,
        );
      case "missing":
      default:
        throw new Error(
          `replacement ${i} does not match ${step.target}: neither its find text nor its ` +
            `replacement is present. This is version skew — the patch must be re-derived against ` +
            `the installed file. Nothing was written, so the file is exactly as it was.`,
        );
    }
  });

  const origPath = join(thursdayHome, "state", `${step.storageKey}.orig`);
  const changed = pending.length > 0;
  const storesOriginal = changed && !fs.existsSync(origPath);

  const lines: string[] = [];
  if (!changed) {
    lines.push(
      `Patch already applied: ${step.target} (${step.replacements.length} replacements present)`,
    );
  } else {
    lines.push(
      `Patched ${step.target}: applied ${pending.length} of ${step.replacements.length} ` +
        `replacements` +
        (alreadyApplied.length > 0 ? ` (${alreadyApplied.length} already present)` : ""),
    );
    lines.push(
      storesOriginal
        ? `Stored the original at state/${step.storageKey}.orig`
        : `Original already stored at state/${step.storageKey}.orig; left untouched`,
    );
  }

  return {
    target: step.target,
    targetPath: realTarget,
    origPath,
    storesOriginal,
    alreadyApplied,
    pending,
    currentContent,
    nextContent,
    changed,
    output: lines.join("\n"),
  };
}

/** The files and directories a `copy-tree` step would create or overwrite. */
export interface CopyTreePlan {
  /** Directories that do not exist under the destination yet. */
  directories: string[];
  /** Files whose bytes differ from the source, or that are not there at all. */
  files: { src: string; dest: string }[];
}

/**
 * Walk a source tree and work out what a copy would actually change.
 *
 * Content-compared per file, which is the idempotence `copy-tree` claims: an
 * identical file is left alone, so its mtime and the uninstall check stay
 * stable. Shared by the dry run and the apply so the two cannot disagree about
 * the file count they report.
 *
 * When `fromPath` names a single file rather than a directory, `toPath` is
 * the destination FILE (copy-tree of one file is the same operation as a
 * copy-file would be — `agents-md` and `mcp-servers` both rely on this).
 * The caller reports a missing source with block, step and root; this
 * function assumes the source exists.
 */
export function planCopyTree(fromPath: string, toPath: string, fs: FilesystemAPI): CopyTreePlan {
  const directories: string[] = [];
  const files: { src: string; dest: string }[] = [];

  if (fs.statSync(fromPath).isFile()) {
    if (fs.existsSync(toPath)) {
      const before = Buffer.from(fs.readFileSync(fromPath) as Buffer);
      const after = Buffer.from(fs.readFileSync(toPath) as Buffer);
      if (!before.equals(after)) files.push({ src: fromPath, dest: toPath });
    } else {
      files.push({ src: fromPath, dest: toPath });
    }
    return { directories, files };
  }

  const walk = (src: string, dest: string): void => {
    if (!fs.existsSync(dest)) directories.push(dest);
    for (const name of fs.readdirSync(src) as string[]) {
      const srcChild = join(src, String(name));
      const destChild = join(dest, String(name));
      const stat = fs.statSync(srcChild);
      if (stat.isDirectory()) {
        walk(srcChild, destChild);
        continue;
      }
      if (!stat.isFile()) continue;
      if (fs.existsSync(destChild)) {
        const before = Buffer.from(fs.readFileSync(srcChild) as Buffer);
        const after = Buffer.from(fs.readFileSync(destChild) as Buffer);
        if (before.equals(after)) continue;
      }
      files.push({ src: srcChild, dest: destChild });
    }
  };

  walk(fromPath, toPath);
  return { directories, files };
}

/**
 * Run a single detect step against the filesystem.
 */
export function runDetectStep(
  step: DetectStep,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): boolean {
  switch (step.action) {
    case "path-exists": {
      const path = join(baseDirFor(step.base, dshPath, thursdayHome), step.path);
      return fs.existsSync(path);
    }

    case "file-contains": {
      const path = join(baseDirFor(step.base, dshPath, thursdayHome), step.file);
      if (!fs.existsSync(path)) return false;
      try {
        const content = fs.readFileSync(path, "utf8") as string;
        return content.includes(step.text);
      } catch {
        // Unreadable is not "contains": a directory, a broken link or a
        // permission error all mean the block cannot be called installed.
        return false;
      }
    }

    case "package-installed": {
      const profile = step.profile ?? "web";
      const nodeModules = join(dshPath, "profiles", profile, "node_modules", step.name);
      return fs.existsSync(nodeModules);
    }

    case "row-present": {
      const patchPath = join(dshPath, "profiles/web/cordis.patch.yml");
      if (!fs.existsSync(patchPath)) return false;

      try {
        const content = fs.readFileSync(patchPath, "utf8");
        const doc = parseYaml(content);
        const entries = Array.isArray(doc) ? doc : [doc];

        const placement = step.placement ?? "insert";
        let found = false;

        if (placement === "insert" && Array.isArray(entries[0]?.insert)) {
          found = entries[0].insert.some((row: any) => rowPresentSatisfied(step, row));
        } else if (placement === "override") {
          found = entries.some(
            (entry: any) =>
              typeof entry === "object" &&
              entry !== null &&
              entry.id === step.id &&
              rowPresentSatisfied(step, entry),
          );
        }

        return found;
      } catch {
        return false;
      }
    }

    case "settings-key-equals": {
      const file = step.file ?? "settings.yaml";
      const filePath = join(dshPath, file);
      if (!fs.existsSync(filePath)) return false;

      try {
        const content = fs.readFileSync(filePath, "utf8");
        const doc = parseYaml(content);

        let current = doc as any;
        for (const segment of step.key.split(".")) {
          if (current === null || typeof current !== "object") return false;
          current = current[segment];
        }

        return JSON.stringify(current) === JSON.stringify(step.value);
      } catch {
        return false;
      }
    }

    default:
      throw new Error(`unknown detect action: ${(step as any).action}`);
  }
}

/**
 * Detect whether a block is installed by running its detect steps.
 */
export function detectBlockStatus(
  block: Block,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): BlockDetection {
  const blockId = block.frontmatter.id;

  const allPass = block.frontmatter.detect.every((step) =>
    runDetectStep(step, dshPath, thursdayHome, fs),
  );

  if (!allPass) {
    return {
      blockId,
      status: "not-installed",
      shouldInstall: true,
      reason: "one or more detect steps failed",
    };
  }

  return {
    blockId,
    status: "installed-and-current",
    shouldInstall: false,
    reason: "all detect steps passed",
  };
}

/**
 * Plan which steps to run, in dependency order.
 */
export function planInstall(
  blocks: readonly Block[],
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): ExecutionPlan {
  const problems: InstallProblem[] = [];
  const steps: PlannedStep[] = [];

  try {
    const ordered = orderBlocks(blocks);

    for (const block of ordered) {
      const detection = detectBlockStatus(block, dshPath, thursdayHome, fs);

      if (!detection.shouldInstall) {
        continue;
      }

      for (let i = 0; i < block.frontmatter.steps.length; i++) {
        const step = block.frontmatter.steps[i];
        steps.push({
          blockId: block.frontmatter.id,
          blockRationale: block.frontmatter.rationale,
          index: i,
          step,
          dryRun: false,
        });
      }
    }

    return { steps, problems };
  } catch (err) {
    problems.push({
      message: `planning failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { steps, problems };
  }
}

/**
 * Execute a single install step.
 *
 * `dryRun` performs every read and every comparison the apply performs and
 * skips only the writes, so the `changed` flag and the `output` a dry run
 * reports are the ones the apply will report. That is the whole point: a
 * summary that says "3 changed" for a machine already in the target state is
 * not a preview, it is a different answer to a different question.
 *
 * Two families cannot be predicted to the byte and say so rather than
 * pretending: `run`, whose output is the command's own stdout, and the pnpm
 * actions, whose output is pnpm's. For those a dry run reports the command it
 * would run and the `changed` flag it can derive from the filesystem; the
 * apply's output additionally carries whatever the command printed.
 */
export async function executeStep(
  planned: PlannedStep,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
  dryRun = false,
  distRoot: string = distributionRoot,
): Promise<StepResult> {
  const { step, blockId, blockRationale } = planned;
  const output: string[] = [];

  try {
    switch (step.action) {
      case "pnpm-add": {
        const profile = step.profile ?? "web";
        const profilePath = join(dshPath, "profiles", profile);
        const spec = step.spec;
        const name = step.as ?? spec.split("/").pop()?.split("@")[0] ?? spec;

        const nodeModulesPath = join(profilePath, "node_modules", name);
        const alreadyInstalled = fs.existsSync(nodeModulesPath);

        if (alreadyInstalled) {
          output.push(`Package already installed: ${name}`);
          return {
            step: planned,
            changed: false,
            output: output.join("\n"),
          };
        }

        const storeDir = join(thursdayHome, "cache", "pnpm-store");
        if (!dryRun) {
          fs.mkdirSync(profilePath, { recursive: true });
          fs.mkdirSync(storeDir, { recursive: true });
        }

        // Pin the profile to the dsh family the RUNTIME resolved, before pnpm
        // is asked to resolve anything here. Without it every add into a fresh
        // profile fails with ERR_PNPM_NO_MATCHING_VERSION; see
        // collectRuntimeOverrides for the cause and for why the map is derived
        // and restricted to the `dsh` prefix.
        //
        // Overrides live in pnpm-workspace.yaml, NOT package.json. pnpm 11
        // stopped reading the `pnpm` field and says so: 'The "pnpm" field in
        // package.json is no longer read by pnpm. The following keys were
        // ignored: "pnpm.overrides".' An earlier attempt wrote package.json,
        // and the install failed identically while pnpm parsed and discarded
        // the overrides -- the warning was the only sign.
        //
        // It runs before the FIRST add rather than as its own step, because an
        // override applied after a resolution has happened does not
        // retroactively fix that resolution.
        if (!dryRun) {
          const overrides = collectRuntimeOverrides(join(thursdayHome, "runtime"), fs);
          if (Object.keys(overrides).length > 0) {
            const wsPath = join(profilePath, "pnpm-workspace.yaml");
            let wsDoc: any = {};
            if (fs.existsSync(wsPath)) {
              try {
                wsDoc = parseYaml(fs.readFileSync(wsPath, "utf8") as string) || {};
              } catch {
                wsDoc = {};
              }
            }
            const existing = (wsDoc.overrides ?? {}) as Record<string, string>;
            const differs =
              Object.keys(existing).length !== Object.keys(overrides).length ||
              Object.keys(overrides).some((k) => existing[k] !== overrides[k]);
            if (differs) {
              wsDoc.overrides = overrides;
              fs.writeFileSync(wsPath, stringifyYaml(wsDoc), "utf8");
              output.push(
                `Pinned ${Object.keys(overrides).length} @deepseek-ai/dsh* package(s) to the runtime's resolved versions`,
              );
            }
          }
        }

        if (step.allowBuilds) {
          const workspacePath = join(profilePath, "pnpm-workspace.yaml");
          let workspaceDoc: any = {};
          if (fs.existsSync(workspacePath)) {
            const content = fs.readFileSync(workspacePath, "utf8");
            workspaceDoc = parseYaml(content as string) || {};
          }

          // allowBuilds is a MAP of package name -> boolean, not a list of
          // tarball URLs. Found by running a real install on 2026-09-16: the
          // list form left pnpm writing its own placeholder entries, literally
          // `'koffi': set this to true or false`, which are strings rather
          // than booleans, so pnpm treated every one as NOT allowed and exited
          // non-zero with ERR_PNPM_IGNORED_BUILDS. That failure is what took
          // the runtime install down, and every later step that needed the
          // runtime's node_modules failed behind it -- 13 reported problems
          // from this one shape error. Rewriting the five placeholders as
          // `true` by hand took the same pnpm install from exit 1 to exit 0
          // with all four build scripts running.
          //
          // The keys are package NAMES because the packages that need to build
          // are TRANSITIVE -- koffi, node-pty, protobufjs and @google/genai
          // arrive under @deepseek-ai/dsh, not as anything a block names
          // directly. A per-step entry derived from the spec being added
          // therefore cannot be the whole set, which is why any placeholder
          // pnpm has already written is normalised here rather than ignored.
          if (
            workspaceDoc.allowBuilds === undefined ||
            workspaceDoc.allowBuilds === null ||
            Array.isArray(workspaceDoc.allowBuilds)
          ) {
            const carried: Record<string, boolean> = {};
            if (Array.isArray(workspaceDoc.allowBuilds)) {
              // Migrate the old list form: each entry was `name@url` or a bare
              // spec, and the name is everything before the first `@` that is
              // not the leading scope marker.
              for (const entry of workspaceDoc.allowBuilds as unknown[]) {
                if (typeof entry !== "string" || entry === "") continue;
                const at = entry.indexOf("@", 1);
                const name = at === -1 ? entry : entry.slice(0, at);
                if (name !== "") carried[name] = true;
              }
            }
            workspaceDoc.allowBuilds = carried;
          }

          const allowMap = workspaceDoc.allowBuilds as Record<string, unknown>;

          // Normalise anything that is not a real boolean. pnpm's own
          // placeholder is the string "set this to true or false", and a
          // string is neither true nor false to pnpm: it is not-allowed.
          const normalised: string[] = [];
          for (const key of Object.keys(allowMap)) {
            if (typeof allowMap[key] !== "boolean") {
              allowMap[key] = true;
              normalised.push(key);
            }
          }

          // The KEY SHAPE depends on where the package comes from, and pnpm
          // states both forms itself:
          //
          //   registry package   koffi: true
          //   git-hosted         aidos@https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>: true
          //
          // The git form is what the ORIGINAL code built, and dropping it in
          // favour of a bare name was a regression I introduced while fixing
          // the map-vs-list bug: the runtime install started working and all
          // eight git-hosted adds kept failing, with
          // ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED naming the exact key it
          // wanted. Both forms are map keys; only the list shape was ever
          // wrong.
          let allowKey = name;
          if (spec.startsWith("github:")) {
            const parts = spec.slice(7).split("#");
            const [owner, repo] = parts[0].split("/");
            const ref = parts[1] ?? "main";
            // STRIP THE REF FROM THE NAME. `name` is derived from the spec, so
            // for a github spec it carries the `#<sha>` along with it. That
            // produced the key
            //   aidos#fc435af...@https://codeload.github.com/...
            // where pnpm wanted
            //   aidos@https://codeload.github.com/...
            // and reported the miss with exactly the same
            // ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED it gives for no entry at
            // all. A WRONG key and a MISSING key are indistinguishable in that
            // error, so this was only visible by reading the file back after
            // the write -- worth remembering the next time an allowlist "does
            // not take effect".
            const baseName = (name.split("#")[0] ?? name).trim();
            if (owner !== undefined && repo !== undefined && baseName !== "") {
              allowKey = `${baseName}@https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
            }
          }

          const added = allowKey !== "" && allowMap[allowKey] !== true;
          if (added) allowMap[allowKey] = true;

          if (added || normalised.length > 0) {
            // The line is reported from the comparison, not from the write, so
            // a dry run and an apply say the same thing about it.
            if (added) output.push(`Added allowBuilds entry: ${allowKey}`);
            if (normalised.length > 0) {
              output.push(`Allowed ${normalised.length} pending build(s): ${normalised.join(", ")}`);
            }
            if (!dryRun) {
              fs.writeFileSync(workspacePath, stringifyYaml(workspaceDoc), "utf8");
            }
          }
        }

        output.push(`Installed package: ${spec}${step.as ? ` as ${step.as}` : ""}`);

        if (!dryRun) {
          const env = {
            ...process.env,
            DSH_HOME: dshPath,
            THURSDAY_HOME: thursdayHome,
          };

          try {
            // stdout is INHERITED so a long install shows live progress, but
            // stderr is CAPTURED so the cause can be put in the thrown error.
            // With both inherited, the problem summary printed at the end read
            // "Command failed with exit code 1" and nothing else, while the
            // real message -- for example pnpm's "unable to open database
            // file" when its store is unwritable -- had scrolled far above it.
            // The summary is what gets read in a log or a CI job, so the cause
            // has to be in the summary.
            await execa(
              "pnpm",
              [
                "add",
                `--config.store-dir=${storeDir}`,
                // Aliasing is `<alias>@<spec>`, NOT `--save-as`. pnpm has no
                // --save-as flag and rejects the whole command when it sees
                // one: "Unknown option: 'save-as'. Did you mean 'save-dev'?".
                // Found by running a real install on 2026-09-16; the only
                // block using `as:` is compaction-instant, so this failed
                // exactly one step and did so for a reason unrelated to
                // anything that step was trying to do. The alias form was
                // then confirmed against pnpm 11.22 with the same github
                // spec: it parses, and resolution proceeds past the flag.
                step.as ? `${step.as}@${spec}` : spec,
              ],
              {
                cwd: profilePath,
                env,
                stdio: ["ignore", "inherit", "pipe"],
              },
            );
          } catch (err) {
            throw new Error(`pnpm-add failed for ${spec}: ${describeCommandFailure(err)}`);
          }
        }

        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "copy-tree": {
        // `base` governs the SOURCE only: `dist` (the default) reads the file
        // Thursday ships, `dsh` reads a file a previous step installed. `to`
        // always lands under the dsh home, so a step and its `path-exists`
        // detect agree by construction.
        const sourceBase = step.base ?? "dist";
        const sourceRoot = sourceBase === "dist" ? distRoot : dshPath;
        const fromPath = join(sourceRoot, step.from);
        const toPath = join(dshPath, step.to);

        if (!fs.existsSync(fromPath)) {
          const rootLabel = sourceBase === "dist" ? "the Thursday distribution" : "the dsh home";
          throw new Error(
            `copy-tree source not found for block '${blockId}' step ${planned.index}: ` +
              `'${step.from}' resolved against ${rootLabel} to ${fromPath}, which does not exist. ` +
              (sourceBase === "dist"
                ? `The distribution root is ${sourceRoot}: the file is missing from the tree ` +
                  `being installed, or the step names the wrong relative path.`
                : `The step that installs this source must run first — for aidos, its pnpm-add.`),
          );
        }

        // One walk decides what would change and, on an apply, what is
        // written. The count in the report therefore comes from the same
        // comparison in both modes instead of from a copy that already
        // happened.
        const plan = planCopyTree(fromPath, toPath, fs);

        if (!dryRun) {
          for (const dir of plan.directories) {
            fs.mkdirSync(dir, { recursive: true });
          }
          for (const file of plan.files) {
            fs.mkdirSync(dirname(file.dest), { recursive: true });
            fs.writeFileSync(file.dest, fs.readFileSync(file.src));
          }
        }

        const fromIsFile = fs.statSync(fromPath).isFile();
        if (fromIsFile) {
          output.push(
            plan.files.length > 0
              ? `Copied file: ${step.from} → ${step.to}`
              : `File already current: ${step.to}`,
          );
        } else {
          output.push(
            `Copied tree: ${step.from} → ${step.to} (${plan.files.length} files changed)`,
          );
        }

        return {
          step: planned,
          changed: plan.files.length > 0 || plan.directories.length > 0,
          output: output.join("\n"),
        };
      }

      case "write-file": {
        const filePath = join(baseDirFor(step.base, dshPath, thursdayHome), step.path);
        const exists = fs.existsSync(filePath);
        const current = exists ? (fs.readFileSync(filePath, "utf8") as string) : undefined;

        if (current === step.content) {
          output.push(`File already up to date: ${step.path}`);
          return {
            step: planned,
            changed: false,
            output: output.join("\n"),
          };
        }

        if (!dryRun) {
          fs.mkdirSync(dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, step.content, "utf8");
        }

        output.push(
          `${exists ? "Rewrote" : "Wrote"} file: ${step.path} ` +
            `(${Buffer.byteLength(step.content, "utf8")} bytes)`,
        );

        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "pnpm-install": {
        const cwd = join(baseDirFor(step.base, dshPath, thursdayHome), step.cwd);
        const storeDir = join(thursdayHome, step.storeDir);

        if (!fs.existsSync(cwd)) {
          throw new Error(
            `pnpm-install working directory not found: ${cwd}. The step that creates it ` +
              `(a write-file of its package.json) must run first.`,
          );
        }

        // node_modules is the signal both a dry run and an apply can read, so
        // the two agree by construction. A tree that needs re-resolving after
        // its package.json changed is re-installed by removing node_modules,
        // which is also what a fresh install does.
        if (fs.existsSync(join(cwd, "node_modules"))) {
          output.push(`Dependencies already installed: ${step.cwd}`);
          return {
            step: planned,
            changed: false,
            output: output.join("\n"),
          };
        }

        output.push(`Installed dependencies with pnpm: ${step.cwd} (store: ${step.storeDir})`);

        if (!dryRun) {
          fs.mkdirSync(storeDir, { recursive: true });

          const env = {
            ...process.env,
            DSH_HOME: dshPath,
            THURSDAY_HOME: thursdayHome,
          };

          const runInstall = async () => {
            // See the pnpm-add step above for why stderr is captured.
            await execa("pnpm", ["install", `--config.store-dir=${storeDir}`], {
              cwd,
              env,
              stdio: ["ignore", "inherit", "pipe"],
            });
          };

          try {
            await runInstall();
          } catch (err) {
            // ERR_PNPM_IGNORED_BUILDS is not a failure to install: pnpm has
            // resolved and linked everything, then refused to run the build
            // scripts of packages it has not been told about, and exited
            // non-zero. On a FRESH home it also WRITES the packages it wants a
            // decision on into pnpm-workspace.yaml, as placeholder strings:
            //
            //   allowBuilds:
            //     '@deepseek-ai/dsh-subprocess-local': set this to true or false
            //     koffi: set this to true or false
            //
            // A string is neither true nor false, so a second run fails the
            // same way forever. Found by running a real install on 2026-09-16:
            // this single step failing took down the whole install, because
            // every later step needing the runtime's node_modules failed
            // behind it -- 13 reported problems, one cause.
            //
            // Answering pnpm's own question and retrying ONCE is the fix, and
            // it needs no hardcoded package list: pnpm has just named exactly
            // the packages it wants a decision on, and the packages are
            // transitive (koffi, node-pty, protobufjs, @google/genai arrive
            // under @deepseek-ai/dsh), so no list Thursday maintains by hand
            // could stay correct anyway.
            //
            // The retry is deliberately not a loop. If the second run fails,
            // that is a different problem and it is reported as one.
            // The trigger is the FILE, not the message. pnpm prints
            // ERR_PNPM_IGNORED_BUILDS on STDOUT, and stdout here is inherited
            // so a long install shows live progress -- only stderr is
            // captured. Gating the retry on the message therefore never fired,
            // and the reported failure carried no stderr tail at all, which is
            // exactly how that was spotted. The placeholder entries pnpm wrote
            // are the durable evidence, they are on disk, and they say which
            // packages are involved, so they are the better signal.
            const message = describeCommandFailure(err);
            const normalised = normaliseIgnoredBuilds(cwd, dryRun, fs);
            if (normalised.length === 0) {
              throw new Error(`pnpm install failed in ${cwd}: ${message}`);
            }

            output.push(`Allowed ${normalised.length} pending build(s): ${normalised.join(", ")}`);
            try {
              await runInstall();
            } catch (retryErr) {
              throw new Error(
                `pnpm install failed in ${cwd} after allowing builds ` +
                  `(${normalised.join(", ")}): ${describeCommandFailure(retryErr)}`,
              );
            }
          }
        }

        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "patch-file-exact": {
        // Guards 1 and 2, the classification and the report all live in the
        // preview, which reads and compares but never writes.
        const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);

        if (!preview.changed) {
          output.push(preview.output);
          return {
            step: planned,
            changed: false,
            output: output.join("\n"),
          };
        }

        if (!dryRun) {
          // Guard 4: the original is stored once, before the first write, and
          // a later run never overwrites it — a re-patch has to start from
          // known bytes rather than from text it may have rewritten already.
          if (preview.storesOriginal) {
            fs.mkdirSync(dirname(preview.origPath), { recursive: true });
            fs.writeFileSync(preview.origPath, fs.readFileSync(preview.targetPath));
          }

          // Guard 3: break the link before writing. pnpm materializes
          // node_modules as hardlinks into its store, and an in-place write
          // would edit every other link to the same content. Writing a fresh
          // file and renaming it over the target replaces the directory entry,
          // leaving every other link on the old inode untouched.
          const tempPath = `${preview.targetPath}.thursday-patch-tmp`;
          try {
            fs.writeFileSync(tempPath, preview.nextContent, "utf8");
            fs.renameSync(tempPath, preview.targetPath);
          } catch (err) {
            try {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch {
              // The temp file is beside the target inside the Thursday home;
              // failing to remove it must not mask the write error itself.
            }
            throw err;
          }
        }

        output.push(preview.output);

        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "patch-row": {
        output.push(`Would patch row: ${step.id} (placement: ${step.placement ?? "insert"})`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "disable-row": {
        output.push(`Would disable row: ${step.id}`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "enable-row": {
        output.push(`Would enable row: ${step.id}`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "write-settings-key": {
        const file = step.file ?? "settings.yaml";
        const filePath = join(dshPath, file);

        if (!dryRun) {
          fs.mkdirSync(dirname(filePath), { recursive: true });
        }

        let doc: any = {};
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf8");
            doc = parseYaml(content) || {};
          } catch (err) {
            throw new Error(
              `failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        const keyParts = step.key.split(".");
        let current = doc;
        for (let i = 0; i < keyParts.length - 1; i++) {
          const part = keyParts[i];
          if (!(part in current) || typeof current[part] !== "object") {
            current[part] = {};
          }
          current = current[part];
        }

        const lastKey = keyParts[keyParts.length - 1];
        const oldValue = current[lastKey];
        const newValue = step.value;

        const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

        if (changed) {
          if (!dryRun) {
            current[lastKey] = newValue;
            fs.writeFileSync(filePath, stringifyYaml(doc), "utf8");
          }
          output.push(`Set ${file}[${step.key}] = ${JSON.stringify(newValue)}`);
        } else {
          output.push(`${file}[${step.key}] already set correctly`);
        }

        return {
          step: planned,
          changed,
          output: output.join("\n"),
        };
      }

      case "run": {
        const cwd = step.cwd ? join(dshPath, step.cwd) : dshPath;

        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true });
        }

        const env = {
          ...process.env,
          DSH_HOME: dshPath,
          THURSDAY_HOME: thursdayHome,
        };

        try {
          const result = await execa(step.command, step.args ?? [], {
            cwd,
            env,
          });

          output.push(`Ran: ${step.command} ${(step.args ?? []).join(" ")}`);
          output.push(result.stdout || "");

          return {
            step: planned,
            changed: true,
            output: output.join("\n"),
          };
        } catch (err) {
          throw new Error(
            `command failed: ${step.command}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      default:
        throw new Error(`unknown install action: ${(step as any).action}`);
    }
  } catch (err) {
    throw new Error(
      `step ${planned.index} (${step.action}) in block ${blockId} failed: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Execute the installation plan.
 */
export async function executeInstall(
  plan: ExecutionPlan,
  dshPath: string,
  thursdayHome: string,
  options?: InstallOptions,
): Promise<InstallResult> {
  const dryRun = options?.dryRun ?? false;
  const quiet = options?.quiet ?? false;
  const fs = options?.fs ?? createFilesystemAPI();
  const distRoot = options?.distRoot ?? distributionRoot;
  const results: StepResult[] = [];
  const problems: InstallProblem[] = [...plan.problems];

  if (!quiet) {
    console.log(
      `\nThursday install: ${plan.steps.length} steps to run${dryRun ? " (dry-run)" : ""}`,
    );
  }

  for (const planned of plan.steps) {
    if (!quiet) {
      console.log(`\n[${planned.blockId}] ${planned.step.action} (step ${planned.index})`);
    }

    try {
      const result = await executeStep(planned, dshPath, thursdayHome, fs, dryRun, distRoot);
      results.push(result);
      if (!quiet) {
        console.log(`  ${dryRun ? "[dry-run]" : "✓"} ${result.step.step.action}`);
        if (result.output && !quiet) {
          console.log(`    ${result.output.split("\n").join("\n    ")}`);
        }
      }
    } catch (err) {
      problems.push({
        block: planned.blockId,
        step: planned.index,
        message: err instanceof Error ? err.message : String(err),
      });
      if (!quiet) {
        console.error(`  ✗ error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const anyChanged = results.some((r) => r.changed);

  if (!quiet) {
    console.log(
      `\n${dryRun ? "Would install" : "Installed"}: ${results.length} steps, ` +
        `${results.filter((r) => r.changed).length} changed`,
    );
  }

  return { steps: results, anyChanged, problems };
}

/**
 * Create the default filesystem API using Node.js fs module.
 */
export function createFilesystemAPI(): FilesystemAPI {
  return {
    existsSync: fsDefault.existsSync,
    readFileSync: fsDefault.readFileSync,
    writeFileSync: fsDefault.writeFileSync,
    mkdirSync: fsDefault.mkdirSync,
    realpathSync: fsDefault.realpathSync,
    renameSync: fsDefault.renameSync,
    unlinkSync: fsDefault.unlinkSync,
    readdirSync: fsDefault.readdirSync,
    statSync: fsDefault.statSync,
    promises: {
      readFile: fsPromisesDefault.readFile,
      writeFile: fsPromisesDefault.writeFile,
      mkdir: fsPromisesDefault.mkdir,
      cp: fsPromisesDefault.cp,
    },
  };
}

/**
 * High-level install executor.
 */
export async function install(
  blocks: readonly Block[],
  options?: InstallOptions,
): Promise<InstallResult> {
  const resolved = resolveThursdayHome();
  const thursdayHome = options?.thursdayHome ?? resolved.path;
  const dshPath = join(thursdayHome, "dsh");
  const fs = options?.fs ?? createFilesystemAPI();

  fs.mkdirSync(dshPath, { recursive: true });

  const plan = planInstall(blocks, dshPath, thursdayHome, fs);

  return executeInstall(plan, dshPath, thursdayHome, { ...options, fs });
}
