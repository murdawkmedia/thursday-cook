import { z } from "zod";

import { constraintNameSchema, type ConstraintName } from "./constraints";
import type { BlockProblem } from "./errors";

/**
 * Where an action resolves its relative paths from.
 *
 * `home` is `$THURSDAY_HOME` itself; `dsh` is `$THURSDAY_HOME/dsh`, the dsh
 * home the launcher exports as `DSH_HOME`. Both roots exist and neither is a
 * safe default for every action: the dsh composition, its profiles and its
 * settings live under `dsh/`, while the pinned runtime (`runtime/`) and
 * Thursday's own state (`state/`) are siblings of it. Each action below
 * therefore states its own default in the field's doc comment rather than
 * inheriting one global answer, and a block that wants the other root says so
 * in one word.
 */
export const pathBaseSchema = z.enum(["home", "dsh"]);

/** Where an action's relative paths are resolved from. */
export type PathBase = z.infer<typeof pathBaseSchema>;

/**
 * Where a `copy-tree` step resolves its SOURCE (`from`) from.
 *
 * Deliberately NOT `pathBaseSchema`. A copy source is either a file Thursday
 * ships or a file a previous step installed, and those live in exactly two
 * places, neither of which is `$THURSDAY_HOME` itself:
 *
 * - `dist` is the Thursday distribution: the tree holding the files being
 *   installed (this checkout, the global npm prefix, the pnpm link, the
 *   container's clone), resolved by `dist-root.ts` from the engine's own
 *   module location. This is the default, because a block author writing a
 *   bare `from: skills` means the repository — every one of the six I9
 *   sources did, and the old missing default is where that bug came from.
 * - `dsh` is `$THURSDAY_HOME/dsh`, for the one step whose source a previous
 *   step put there: `aidos` copies `profiles/web/node_modules/aidos/skills`
 *   after its `pnpm-add` installed that package. That step says `base: dsh`
 *   in one word, and a blanket rebase must never silently flip it back.
 *
 * `to` is NOT governed by this field: destinations always resolve under the
 * dsh home, so a step and its `path-exists` detect agree by construction.
 */
export const copyTreeSourceBaseSchema = z.enum(["dist", "dsh"]);

/** Where a `copy-tree` step's source is resolved from. */
export type CopyTreeSourceBase = z.infer<typeof copyTreeSourceBaseSchema>;

/**
 * Keys every step may carry, whatever its action.
 *
 * `constraint` attaches one named constraint to this step, and `why` records
 * the reason in prose beside it. Keeping both on the step means the knowledge
 * lives next to the thing it constrains rather than in a comment the installer
 * cannot read. An action's own shape may redefine either: `run` makes `why`
 * mandatory.
 */
const stepMetaShape = {
  /** A constraint the installer must honour while running this step. An array
   * states several obligations about one change, such as placement AND
   * completeness on the same override row. */
  constraint: z.union([constraintNameSchema, z.array(constraintNameSchema)]).optional(),
  /** Why this step is written this way. Required when `constraint` is set. */
  why: z.string().min(1).optional(),
};

/**
 * One named action: a step an author can reference by name.
 *
 * The whole point of the format is that steps are TypeScript with typed
 * parameters rather than shell or YAML logic. A definition therefore carries
 * its parameter schema, so an unknown action or a bad parameter is a load-time
 * error rather than a half-finished install.
 */
export interface ActionDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
  /** The name blocks write in `action:`. */
  readonly name: string;
  /**
   * `install` actions change the machine and appear in `steps` and `reverse`.
   * `detect` actions are predicates: they answer "is this already installed?"
   * for `detect`, must not change anything, and cannot be used as steps.
   */
  readonly kind: "install" | "detect";
  /** One line: what this action does. */
  readonly summary: string;
  /**
   * How re-running it converges. Every action is idempotent; this says on what
   * basis, because that is the part a reviewer has to check.
   */
  readonly idempotence: string;
  /** Constraints this action understands and honours. */
  readonly honours: readonly ConstraintName[];
  /** Validator for the step's parameters, which are siblings of `action:`. */
  readonly params: z.ZodObject<S>;
}

function defineAction<S extends z.ZodRawShape>(def: {
  name: string;
  kind: "install" | "detect";
  summary: string;
  idempotence: string;
  honours?: readonly ConstraintName[];
  shape: S;
}): ActionDefinition<typeof stepMetaShape & S> {
  return {
    name: def.name,
    kind: def.kind,
    summary: def.summary,
    idempotence: def.idempotence,
    honours: def.honours ?? [],
    // Action-specific keys are spread last so an action can tighten a meta
    // key, which is how `run` turns the optional `why` into a required one.
    params: z.strictObject({ ...stepMetaShape, ...def.shape }),
  };
}

/**
 * Actions that change the machine. Referenced from `steps` (and `reverse`).
 *
 * A block that needs behaviour no action provides gets a new action here, not
 * an escape hatch in the block.
 */
export const INSTALL_ACTIONS = {
  "pnpm-add": defineAction({
    name: "pnpm-add",
    kind: "install",
    summary: "Add one package to a dsh profile with pnpm.",
    idempotence:
      "pnpm converges on the pinned spec: re-adding an installed spec re-resolves it and changes nothing.",
    honours: ["needs-allow-builds", "alias-install-name"],
    shape: {
      /** The pnpm spec: a registry range, a git spec, a tarball URL, or a path. */
      spec: z.string().min(1),
      /**
       * Install under this package name instead of the spec's own name.
       * Declare `constraint: alias-install-name` with it, so the reason a
       * package wears another package's name is recorded rather than guessed.
       */
      as: z.string().min(1).optional(),
      /** The dsh profile to install into. Defaults to the web profile. */
      profile: z.string().min(1).default("web"),
      /**
       * The package runs a lifecycle script and needs its resolved tarball URL
       * allow-listed first. The installer reconstructs that URL from `spec`;
       * see the needs-allow-builds constraint.
       */
      allowBuilds: z.boolean().default(false),
    },
  }),

  "patch-row": defineAction({
    name: "patch-row",
    kind: "install",
    summary: "Write one loader row into the profile's dsh composition patch.",
    idempotence:
      "Rows are keyed by id: an existing row with this id is rewritten in place rather than appended.",
    honours: ["top-level-override", "wholesale-override-config", "nested-tool-config"],
    shape: {
      /** The loader entry id. Unique across the whole composition. */
      id: z.string().min(1),
      /** The package or bundle path the row loads. */
      name: z.string().min(1).optional(),
      /**
       * The row's own `config:` block. Options a plugin declares in its Config
       * schema belong in here and nowhere else; see nested-tool-config.
       */
      config: z.record(z.string(), z.unknown()).optional(),
      /**
       * `insert` adds a new row to the insert list. `override` edits a row an
       * upstream bundle already owns, as a top-level row. Choosing `insert`
       * for an id dsh-base owns kills boot; see top-level-override.
       */
      placement: z.enum(["insert", "override"]).default("insert"),
    },
  }),

  "disable-row": defineAction({
    name: "disable-row",
    kind: "install",
    summary: "Disable a loader row an upstream bundle owns.",
    idempotence: "Sets disabled: true on the override row; already-disabled is a no-op.",
    honours: ["top-level-override", "wholesale-override-config"],
    shape: {
      /** The id of the upstream row to switch off. */
      id: z.string().min(1),
    },
  }),

  "enable-row": defineAction({
    name: "enable-row",
    kind: "install",
    summary: "Re-enable a loader row a downstream bundle disabled.",
    idempotence: "Sets disabled: false on the override row; already-enabled is a no-op.",
    honours: ["top-level-override", "wholesale-override-config"],
    shape: {
      /** The id of the row to switch back on. */
      id: z.string().min(1),
    },
  }),

  "copy-tree": defineAction({
    name: "copy-tree",
    kind: "install",
    summary: "Copy a directory tree — or a single file — into the dsh home.",
    idempotence:
      "Content-compared per file: identical files are left alone, so mtimes and the uninstall check stay stable.",
    honours: [],
    shape: {
      /**
       * Source, relative to `base`. A directory is copied as a tree; a single
       * file is copied to `to` as a file (copy-tree of one file is the same
       * operation as a copy-file would be, so there is no separate action).
       */
      from: z.string().min(1),
      /** Destination, relative to the dsh home — always, whatever `base` says. */
      to: z.string().min(1),
      /**
       * Which root `from` is relative to. Defaults to the distribution,
       * because that is what a block author means by a bare relative path;
       * the dsh-relative cases (a step consuming a previous step's install)
       * say `base: dsh` explicitly.
       */
      base: copyTreeSourceBaseSchema.default("dist"),
      /**
       * Delete files under `to` that `from` no longer has. Off by default:
       * a sync that prunes by default eats anything a user dropped alongside.
       * Meaningful only when `from` is a directory.
       */
      prune: z.boolean().default(false),
    },
  }),

  "write-settings-key": defineAction({
    name: "write-settings-key",
    kind: "install",
    summary: "Set one key in a YAML settings or preset file, byte-preserving.",
    idempotence: "Writes only when the current value differs; the file is untouched otherwise.",
    honours: ["no-yaml-round-trip", "nested-tool-config"],
    shape: {
      /** The file, relative to the Thursday home. Defaults to settings.yaml. */
      file: z.string().min(1).default("settings.yaml"),
      /**
       * Dotted path to the key, e.g. `profile.active`. Write the full path
       * including any `config` segment: a tool's own options nest inside its
       * `config` block, and a path that skips it writes a key nothing reads.
       */
      key: z.string().min(1),
      /** The value to write. Any YAML scalar, map or sequence. */
      value: z.unknown(),
    },
  }),

  "write-file": defineAction({
    name: "write-file",
    kind: "install",
    summary: "Write content to a file, creating parent directories if needed.",
    idempotence: "Compares current content byte-for-byte; file is untouched if content matches.",
    honours: [],
    shape: {
      /** The file path, relative to `base`. */
      path: z.string().min(1),
      /** The full content to write to the file. */
      content: z.string().min(1),
      /**
       * Which root `path` is relative to. Defaults to the Thursday home,
       * because the files this action writes — `runtime/package.json` above
       * all — are siblings of the dsh home rather than members of it.
       */
      base: pathBaseSchema.default("home"),
    },
  }),

  "pnpm-install": defineAction({
    name: "pnpm-install",
    kind: "install",
    summary: "Run pnpm install with store-dir pointing to Thursday's cache.",
    idempotence:
      "Decided by the presence of `node_modules` in the working directory: an install that already has one is reported as unchanged and pnpm is not run. The same signal is read by a dry run, so a dry run and an apply agree. After a zero-exit run the step verifies `node_modules` exists in the cwd and fails loudly — naming the enclosing-workspace hoist as the likely cause — when it does not, because exit 0 is not success: a cwd absorbed into an enclosing pnpm workspace installs nothing where the installer expects it.",
    honours: [],
    shape: {
      /** Working directory for pnpm install, relative to `base`. */
      cwd: z.string().min(1),
      /** The pnpm store directory, relative to the Thursday home. Defaults to cache/pnpm-store. */
      storeDir: z.string().min(1).default("cache/pnpm-store"),
      /** Which root `cwd` is relative to. Defaults to the Thursday home. */
      base: pathBaseSchema.default("home"),
    },
  }),

  /**
   * Apply exact-string replacements to a file with full guards. Every item on
   * this list is implemented by `executeStep`'s `patch-file-exact` case in
   * `install.ts`, and each has a test in `tests/patch-file-exact.test.ts` that
   * fails when the guard is removed:
   *
   * 1. resolve the target and fail loudly when it is absent — a missing file
   *    means the install that was supposed to create it did not finish, and
   *    "nothing to patch, exit 0" is the aidos-script defect `docs/fs-sandbox.md`
   *    tells Thursday not to inherit;
   * 2. `realpath` the resolved file and refuse unless the result is under
   *    `$THURSDAY_HOME` — the guard that stops a symlink planted in the runtime
   *    tree from redirecting a patch onto an arbitrary file;
   * 3. break hardlinks before writing (write a temp file beside the target and
   *    rename it over), so patching Thursday's copy cannot mutate a file another
   *    install shares through a hardlinked pnpm store;
   * 4. store the original once, before the first write, at `state/<storageKey>.orig`,
   *    and never overwrite an existing one on a later run.
   *
   * This action exists because no simpler action can express "resolve + guard +
   * patch + store-orig". The dsh-runtime block uses it for A6's fs-sandbox
   * exemption, and it is designed for any similar exact-string patching.
   */
  "patch-file-exact": defineAction({
    name: "patch-file-exact",
    kind: "install",
    summary:
      "Apply exact-string replacements to a file with full guards (resolve, realpath, break links, orig-storage).",
    idempotence:
      "Idempotent via exact-string match: a replacement whose `replace` text is already present is counted as applied and skipped, so a second run writes nothing. Every remaining replacement must match its `find` exactly once; if any one does not, the step fails having written nothing at all, rather than leaving a half-patched file.",
    honours: [],
    shape: {
      /** The file to patch, relative to `base`. Resolution is exact: a missing file fails loudly. */
      target: z.string().min(1),
      /** A storage key for the original file backup, e.g. 'dsh-sandbox'. Stored at `state/<key>.orig` under the Thursday home. */
      storageKey: z.string().min(1),
      /**
       * Array of {find, replace} replacements. Every replacement must either
       * already be applied or match its `find` exactly once; anything else
       * fails the step before a single byte is written. Order matters: they are
       * applied in order and a later one may depend on an earlier one. Matching
       * is literal string matching, never regex.
       *
       * Write `find` so that it cannot survive its own replacement — a `find`
       * that is a substring of its `replace` re-matches for ever, which is how
       * a patch step ends up appending its own text on every run.
       */
      replacements: z
        .array(
          z.object({
            /** The exact text to find. Must appear exactly once, or already be replaced. */
            find: z.string().min(1),
            /** The text to replace it with. Its presence is what marks the replacement as applied. */
            replace: z.string().min(1),
          }),
        )
        .min(1),
      /**
       * Which root `target` is relative to. Defaults to the Thursday home: the
       * file this action was written for lives under `runtime/`, outside the
       * dsh home. `state/<storageKey>.orig` is always under the Thursday home,
       * whatever `base` says, because the backup is Thursday's own bookkeeping.
       */
      base: pathBaseSchema.default("home"),
    },
  }),

  run: defineAction({
    name: "run",
    kind: "install",
    summary: "Run a command. LAST RESORT: acceptable only for a third-party installer with no API.",
    idempotence:
      "Not guaranteed by the action. The command itself must converge on re-run, and `why` should say how.",
    honours: [],
    shape: {
      /** The executable. Looked up on PATH; not a shell line, so no pipes. */
      command: z.string().min(1),
      /** Arguments, passed through without a shell, so no globbing or quoting. */
      args: z.array(z.string()).default([]),
      /** Working directory, relative to the Thursday home. */
      cwd: z.string().min(1).optional(),
      /**
       * Why no action can express this. Mandatory, and reviewed as a request
       * for a new action: anything with a conditional, anything whose failure
       * needs interpreting, and anything touching a path this block declares
       * belongs in TypeScript where it can be tested.
       */
      why: z.string().min(1),
    },
  }),

  "assert-deps-satisfied": defineAction({
    name: "assert-deps-satisfied",
    kind: "install",
    summary:
      "Fail the install when an installed dependency's version falls outside a dependent's declared range.",
    idempotence:
      "Read-only: compares installed versions against declared ranges and changes nothing, so re-running changes nothing.",
    honours: [],
    shape: {
      /** The dependency package whose installed version is checked, e.g. "@deepseek-ai/dsh-tools". */
      name: z.string().min(1),
      /**
       * Installed packages that must each declare a range for `name` that the
       * installed version satisfies. A dependent with no declared range for
       * `name` fails: a silent vacuous pass is the bug this action exists to
       * prevent. Carries no version string of its own — the pin lives in the
       * `pnpm-add` step, this step only checks it still satisfies everyone.
       */
      dependents: z.array(z.string().min(1)).min(1),
      /** The dsh profile to look in. Defaults to the web profile. */
      profile: z.string().min(1).default("web"),
    },
  }),
} as const;

/**
 * Predicates that answer "is this component already installed?".
 *
 * Read-only by construction: they are the reason a block needs no conditional.
 * The installer runs `detect` first and skips the steps when it passes, so the
 * "already installed?" branch lives in TypeScript rather than in frontmatter.
 */
export const DETECT_ACTIONS = {
  "row-present": defineAction({
    name: "row-present",
    kind: "detect",
    summary: "The composition patch has a row with this id (and name, if given).",
    idempotence: "Read-only.",
    honours: [],
    shape: {
      /** The loader entry id to look for. */
      id: z.string().min(1),
      /** Also require the row to load this package or path. */
      name: z.string().min(1).optional(),
      /** Which list to look in. Defaults to the insert list. */
      placement: z.enum(["insert", "override"]).default("insert"),
      /**
       * When set, the row must ALSO carry this `disabled` value. This is the
       * only way `detect` can assert "the builtin row is OFF": without it, a
       * row someone re-enabled by hand still counts as present, and dsh
       * itself treats a no-match patch as a warning, so the failure is
       * silent at both layers.
       */
      disabled: z.boolean().optional(),
    },
  }),

  "path-exists": defineAction({
    name: "path-exists",
    kind: "detect",
    summary: "A path exists under the Thursday home.",
    idempotence: "Read-only.",
    honours: [],
    shape: {
      /** The path, relative to `base`. */
      path: z.string().min(1),
      /**
       * Which root `path` is relative to. Defaults to the dsh home, because
       * every path this predicate was written against — `skills`,
       * `plugins/bash-guard.js`, `skills/aidos` — is a path some `copy-tree`
       * or `patch-row` step wrote under `dsh/`. A block checking for something
       * outside it, such as `runtime/`, sets `base: home`.
       */
      base: pathBaseSchema.default("dsh"),
    },
  }),

  "package-installed": defineAction({
    name: "package-installed",
    kind: "detect",
    summary: "A package is present in a profile's node_modules.",
    idempotence: "Read-only.",
    honours: ["alias-install-name"],
    shape: {
      /**
       * The installed package name. For an aliased install this is the name it
       * was installed AS, not the name of the repository it came from.
       */
      name: z.string().min(1),
      /** The dsh profile to look in. Defaults to the web profile. */
      profile: z.string().min(1).default("web"),
    },
  }),

  "settings-key-equals": defineAction({
    name: "settings-key-equals",
    kind: "detect",
    summary: "A key in a settings or preset file already has this value.",
    idempotence: "Read-only. Reads the file without rewriting it.",
    honours: ["no-yaml-round-trip"],
    shape: {
      /** The file, relative to the Thursday home. Defaults to settings.yaml. */
      file: z.string().min(1).default("settings.yaml"),
      /** Dotted path to the key, e.g. `profile.active`. */
      key: z.string().min(1),
      /** The value it must already have. */
      value: z.unknown(),
    },
  }),

  "file-contains": defineAction({
    name: "file-contains",
    kind: "detect",
    summary: "A file exists and contains specific text.",
    idempotence: "Read-only.",
    honours: [],
    shape: {
      /** The file to check, relative to `base`. */
      file: z.string().min(1),
      /** The text that must appear in the file. Literal, never a regex. */
      text: z.string().min(1),
      /**
       * Which root `file` is relative to. Defaults to the Thursday home, to
       * match the actions that write the files this predicate checks.
       */
      base: pathBaseSchema.default("home"),
    },
  }),
} as const;

/** The name of an action that changes the machine. */
export type InstallActionName = keyof typeof INSTALL_ACTIONS;
/** The name of a detection predicate. */
export type DetectActionName = keyof typeof DETECT_ACTIONS;

/** Every install action name, in registry order. */
export const INSTALL_ACTION_NAMES = Object.keys(INSTALL_ACTIONS) as InstallActionName[];
/** Every detect action name, in registry order. */
export const DETECT_ACTION_NAMES = Object.keys(DETECT_ACTIONS) as DetectActionName[];

/** One validated step: the action name plus that action's typed parameters. */
export type Step = {
  [K in InstallActionName]: { action: K } & z.infer<(typeof INSTALL_ACTIONS)[K]["params"]>;
}[InstallActionName];

/** One validated detection step. */
export type DetectStep = {
  [K in DetectActionName]: { action: K } & z.infer<(typeof DETECT_ACTIONS)[K]["params"]>;
}[DetectActionName];

/**
 * Evaluate one `row-present` detect step against a patch row.
 *
 * `row` is the row found in the composition patch for the step's id and
 * placement, or undefined when there is none. The step passes only when the
 * row exists, matches `name` when the step gave one, and matches `disabled`
 * when the step gave one. Pure so the installer's patch reader and the tests
 * share one definition of "present".
 */
export function rowPresentSatisfied(
  step: { name?: string; disabled?: boolean },
  row: { name?: string; disabled?: boolean } | undefined,
): boolean {
  if (row === undefined) return false;
  if (step.name !== undefined && row.name !== step.name) return false;
  if (step.disabled !== undefined && row.disabled !== step.disabled) return false;
  return true;
}

function registryFor(kind: "install" | "detect"): Record<string, ActionDefinition> {
  return kind === "install" ? INSTALL_ACTIONS : DETECT_ACTIONS;
}

function namesFor(kind: "install" | "detect"): string[] {
  return kind === "install" ? INSTALL_ACTION_NAMES : DETECT_ACTION_NAMES;
}

/**
 * Validate one list of steps against the registry.
 *
 * Collects problems rather than throwing, so a block reports every fault at
 * once. Returns the validated steps with defaults applied; entries that failed
 * are dropped from the result, and the caller throws when problems is not
 * empty.
 */
export function validateStepList(
  entries: readonly unknown[],
  kind: "install" | "detect",
  field: string,
  problems: BlockProblem[],
): unknown[] {
  const registry = registryFor(kind);
  const known = namesFor(kind);
  const other = kind === "install" ? DETECT_ACTIONS : INSTALL_ACTIONS;
  const out: unknown[] = [];

  entries.forEach((entry, i) => {
    const at = `${field}[${i}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      problems.push({ field: at, message: "expected a step object with an `action` key" });
      return;
    }
    const raw = entry as Record<string, unknown>;
    const name = raw["action"];
    if (typeof name !== "string" || name.length === 0) {
      problems.push({
        field: `${at}.action`,
        message: `required; must name one of: ${known.join(", ")}`,
      });
      return;
    }
    const def = registry[name];
    if (def === undefined) {
      const misplaced = (other as unknown as Record<string, ActionDefinition>)[name];
      const hint =
        misplaced === undefined
          ? `known ${kind} actions: ${known.join(", ")}`
          : kind === "install"
            ? `\`${name}\` is a detect action and can only appear in \`detect\`. Known install actions: ${known.join(", ")}`
            : `\`${name}\` changes the machine and cannot be used for detection. Known detect actions: ${known.join(", ")}`;
      problems.push({ field: `${at}.action`, message: `unknown action \`${name}\`; ${hint}` });
      return;
    }

    const { action: _ignored, ...params } = raw;
    const parsed = def.params.safeParse(params);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path
          .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
          .join("");
        problems.push({ field: `${at}${path}`, message: issue.message });
      }
      return;
    }
    const value = parsed.data;
    if (value["constraint"] !== undefined && value["why"] === undefined) {
      problems.push({
        field: `${at}.why`,
        message: `required when \`constraint: ${JSON.stringify(value["constraint"])}\` is declared: record the reason next to the constraint`,
      });
      return;
    }
    out.push({ action: name, ...value });
  });

  return out;
}
