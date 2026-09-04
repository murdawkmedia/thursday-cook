import { z } from "zod";

import { constraintNameSchema, type ConstraintName } from "./constraints";
import type { BlockProblem } from "./errors";

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
  /** A constraint the installer must honour while running this step. */
  constraint: constraintNameSchema.optional(),
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
    honours: ["top-level-override", "nested-tool-config"],
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
    honours: ["top-level-override"],
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
    honours: ["top-level-override"],
    shape: {
      /** The id of the row to switch back on. */
      id: z.string().min(1),
    },
  }),

  "copy-tree": defineAction({
    name: "copy-tree",
    kind: "install",
    summary: "Copy a directory tree into the Thursday home.",
    idempotence:
      "Content-compared per file: identical files are left alone, so mtimes and the uninstall check stay stable.",
    honours: [],
    shape: {
      /** Source directory, relative to the block's package. */
      from: z.string().min(1),
      /** Destination directory, relative to the Thursday home. */
      to: z.string().min(1),
      /**
       * Delete files under `to` that `from` no longer has. Off by default:
       * a sync that prunes by default eats anything a user dropped alongside.
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
    },
  }),

  "path-exists": defineAction({
    name: "path-exists",
    kind: "detect",
    summary: "A path exists under the Thursday home.",
    idempotence: "Read-only.",
    honours: [],
    shape: {
      /** The path, relative to the Thursday home. */
      path: z.string().min(1),
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

function registryFor(kind: "install" | "detect"): Record<string, ActionDefinition> {
  return (kind === "install" ? INSTALL_ACTIONS : DETECT_ACTIONS) as unknown as Record<
    string,
    ActionDefinition
  >;
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
    const value = parsed.data as Record<string, unknown>;
    if (value["constraint"] !== undefined && value["why"] === undefined) {
      problems.push({
        field: `${at}.why`,
        message: `required when \`constraint: ${String(value["constraint"])}\` is declared: record the reason next to the constraint`,
      });
      return;
    }
    out.push({ action: name, ...value });
  });

  return out;
}
