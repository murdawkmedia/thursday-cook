import { z } from "zod";

import type { DetectStep, Step } from "./actions";
import { constraintNameSchema, type ConstraintName } from "./constraints";

/**
 * A constraint declared for the block as a whole.
 *
 * Use this when the constraint is a property of the component rather than of
 * one file or one step — "this package must be installed under another
 * package's name" is true of the block, not of a line in a YAML file.
 */
export interface DeclaredConstraint {
  /** The constraint name, from the constraint registry. */
  name: ConstraintName;
  /**
   * Why this block is subject to it, in this block's own terms. The registry
   * says what the constraint means in general; this says what breaks here.
   */
  why: string;
}

/**
 * One thing the block puts on disk that was not there before.
 *
 * Everything Thursday installs lives under the Thursday home, and this list is
 * what makes that checkable: the uninstall test compares the dsh tree before
 * and after, and a path declared outside the home is the bug it looks for.
 */
export interface InstalledPath {
  /** Where it lands, relative to the Thursday home. */
  path: string;
  /** Where it comes from: a repo-relative source path, or a package spec. */
  from?: string;
  /** What it is, for someone reading `thursday status`. */
  what?: string;
}

/**
 * One configuration file the block edits rather than owns.
 *
 * "Edits rather than owns" is the whole risk: the file belongs to dsh, or to a
 * user, and a careless write destroys something. `why` is mandatory here for
 * that reason — this is the field that inherits `sync.sh`'s comments.
 */
export interface ConfigChange {
  /** The file, relative to the Thursday home. */
  file: string;
  /** The specific key, dotted, when the edit is one key rather than the file. */
  key?: string;
  /** A named constraint the installer must honour when writing this file. */
  constraint?: ConstraintName;
  /** Why the edit is needed and why it is shaped this way. Always required. */
  why: string;
}

/**
 * One change to the dsh composition: the loader rows a profile boots from.
 *
 * Separate from `modifies` because dsh's composition has rules of its own that
 * plain config files do not: ids are globally unique, overrides are assigned
 * wholesale instead of deep-merged, and a duplicate id kills boot rather than
 * degrading. Recording rows and placement lets `thursday status` answer "who
 * put this row here" and lets a test catch two blocks claiming one id.
 */
export interface DshConfigChange {
  /** The patch or preset file, relative to the Thursday home. */
  file: string;
  /** The loader entry ids this block writes or edits. */
  rows: string[];
  /** Dotted keys touched, when the change is to a preset rather than a row. */
  keys: string[];
  /**
   * `insert` adds new rows; `override` edits rows an upstream bundle owns and
   * must sit at the top level of the patch.
   */
  placement: "insert" | "override";
  /** A named constraint the installer must honour for this change. */
  constraint?: ConstraintName;
  /** Why these rows exist, and what breaks if they move. Always required. */
  why: string;
}

/**
 * One environment variable the block sets or depends on.
 *
 * Declared rather than exported silently, because an environment change is the
 * least visible thing an installer can do and the hardest to attribute later.
 */
export interface EnvironmentChange {
  /** The variable name. */
  name: string;
  /** The value it is set to. Omit when the block only reads it. */
  value?: string;
  /**
   * `process` for the install run only, `thursday-home` for the environment
   * file Thursday's own launcher sources. Nothing writes a user's shell rc:
   * uninstall must leave no trace outside the Thursday home.
   */
  scope: "process" | "thursday-home";
  /** Why it is needed. */
  why: string;
}

/**
 * One command the block puts on the user's PATH, inside the Thursday home.
 *
 * A command is the most visible surface an install has, so it is declared:
 * `thursday status` can list what a block gave you, and a collision between
 * two blocks claiming one name is a load-time fact rather than a surprise.
 */
export interface ProvidedCommand {
  /** The command name as typed. */
  name: string;
  /** The package or path providing it. */
  from?: string;
  /** What it is for. */
  what?: string;
}

/**
 * One thing outside Thursday that this block wires itself into.
 *
 * An MCP server, a hosted API, a git remote, another tool's config. These are
 * the parts an uninstall cannot fully undo and a reviewer most wants listed:
 * removing the Thursday home does not cancel an account or revoke a token.
 */
export interface Integration {
  /** What it integrates with, e.g. `github`, `context7-mcp`. */
  name: string;
  /** The kind of thing it is. */
  kind: "mcp-server" | "service" | "external-tool" | "git-remote";
  /** Whether it needs credentials the user must supply. */
  requiresCredentials: boolean;
  /** What the integration is for. */
  why: string;
}

/**
 * Anything the block does that the fields above do not describe.
 *
 * Deliberately free-form and deliberately last. A schema that has no place for
 * an awkward fact loses the fact; this field is where it goes until it earns a
 * field of its own. A block with several entries here is a schema bug report.
 */
export interface SideEffect {
  /** What happens. */
  what: string;
  /** Where it lands, if it lands anywhere. */
  where?: string;
  /** Why it is necessary. */
  why: string;
  /**
   * Whether removing the Thursday home undoes it. `false` is the interesting
   * case: it is exactly what uninstall cannot clean up, and the user has to be
   * told about it.
   */
  undoneByRemovingHome: boolean;
}

/**
 * The validated frontmatter of one block: everything the installer reads.
 *
 * The prose body is not part of this. Frontmatter is data — no conditionals,
 * no loops, no templating, no expressions — and the reasons live in
 * `rationale`, in the per-item `why` fields, and in the markdown body.
 */
export interface BlockFrontmatter {
  /**
   * Stable identity, kebab-case, unique across all blocks. It is the name a
   * user types (`thursday install llm-pi-ai`), the key other blocks depend on,
   * and the registry entry name later. Renaming one is a breaking change.
   */
  id: string;
  /** Human title for listings. Defaults to the id when absent. */
  title?: string;
  /**
   * Schema-visible revision of this block, a whole number starting at 1.
   * Bumped when the block's effects change, so an installed record can tell
   * "already installed" from "installed, but an older version of this block".
   * Not the version of the software being installed: that lives in the spec.
   */
  version: number;
  /**
   * Why this component is installed at all, in prose, for a reader who has
   * never seen it. Machine-readable on purpose: `thursday status` prints it,
   * so "why is this here" is answered by a command instead of by reading a
   * shell script. Keep it to what the component is for; per-file reasoning
   * belongs on the item, and detail belongs in the body.
   */
  rationale: string;
  /**
   * Ids of blocks that must be installed first. Ordering only — there is no
   * version range and no conditional dependency, because a resolver is a
   * programming language and this format is data.
   */
  dependsOn: string[];
  /** Constraints that apply to the block as a whole. */
  constraints: DeclaredConstraint[];
  /** Files and directories this block puts on disk. */
  installs: InstalledPath[];
  /** Configuration files this block edits but does not own. */
  modifies: ConfigChange[];
  /** Changes to the dsh composition: loader rows and preset keys. */
  dshConfig: DshConfigChange[];
  /** Environment variables this block sets. */
  environment: EnvironmentChange[];
  /** Commands this block puts on PATH inside the Thursday home. */
  commands: ProvidedCommand[];
  /** Third-party systems this block wires into. */
  integrations: Integration[];
  /** Anything else it does, especially anything uninstall cannot undo. */
  sideEffects: SideEffect[];
  /**
   * The install: named actions in order, each with typed parameters. Every
   * action is idempotent, so running the list twice is running it once. No
   * step is conditional; a step that needs to decide something decides it in
   * TypeScript, inside the action, where it can be tested.
   */
  steps: Step[];
  /**
   * How to tell the block is already installed, without installing it. Every
   * entry must hold. The installer runs these first and skips `steps` when
   * they pass — this is where the "already installed?" branch lives, and the
   * reason no block needs an `if`.
   */
  detect: DetectStep[];
  /**
   * OPTIONAL, AND UNUSED AT v0.1.0.
   *
   * Everything Thursday installs lives inside a dedicated Thursday home, so
   * uninstall removes the home rather than replaying recorded effects in
   * reverse. That is a stronger guarantee than a reverse list can give: a
   * replay can only undo what someone remembered to record, while removing the
   * home undoes everything by construction, and the uninstall test proves it
   * by comparing the dsh tree byte for byte.
   *
   * The field exists because that guarantee has a known edge: an effect
   * outside the home — see `integrations` and `sideEffects` with
   * `undoneByRemovingHome: false` — cannot be removed with the home. If a
   * later version needs to undo one, the steps go here, and until then a block
   * that fills it in gets validation but no execution. The loader accepts it,
   * validates it exactly like `steps`, and the installer ignores it.
   */
  reverse?: Step[];
}

const declaredConstraintSchema = z
  .strictObject({
    name: constraintNameSchema,
    why: z.string().min(1, "say why this block is subject to the constraint"),
  })
  .describe("A constraint that applies to the whole block.");

const installedPathSchema = z
  .strictObject({
    path: z.string().min(1),
    from: z.string().min(1).optional(),
    what: z.string().min(1).optional(),
  })
  .describe("A file or directory the block puts on disk.");

const configChangeSchema = z
  .strictObject({
    file: z.string().min(1),
    key: z.string().min(1).optional(),
    constraint: constraintNameSchema.optional(),
    why: z.string().min(1, "required: say why this file is edited and why this way"),
  })
  .describe("A configuration file the block edits but does not own.");

const dshConfigChangeSchema = z
  .strictObject({
    file: z.string().min(1),
    rows: z.array(z.string().min(1)).default([]),
    keys: z.array(z.string().min(1)).default([]),
    placement: z.enum(["insert", "override"]).default("insert"),
    constraint: constraintNameSchema.optional(),
    why: z.string().min(1, "required: say why these rows exist and what breaks if they move"),
  })
  .describe("A change to the dsh composition.");

const environmentChangeSchema = z
  .strictObject({
    name: z.string().min(1),
    value: z.string().optional(),
    scope: z.enum(["process", "thursday-home"]).default("process"),
    why: z.string().min(1, "required: say why the variable is needed"),
  })
  .describe("An environment variable the block sets.");

const providedCommandSchema = z
  .strictObject({
    name: z.string().min(1),
    from: z.string().min(1).optional(),
    what: z.string().min(1).optional(),
  })
  .describe("A command the block puts on PATH inside the Thursday home.");

const integrationSchema = z
  .strictObject({
    name: z.string().min(1),
    kind: z.enum(["mcp-server", "service", "external-tool", "git-remote"]),
    requiresCredentials: z.boolean().default(false),
    why: z.string().min(1, "required: say what the integration is for"),
  })
  .describe("A third-party system the block wires into.");

const sideEffectSchema = z
  .strictObject({
    what: z.string().min(1),
    where: z.string().min(1).optional(),
    why: z.string().min(1, "required: say why the side effect is necessary"),
    undoneByRemovingHome: z.boolean().default(true),
  })
  .describe("Anything the block does that no other field describes.");

/**
 * The frontmatter validator.
 *
 * `steps`, `detect` and `reverse` are checked here only for shape: their
 * entries are validated against the action registry afterwards, so an unknown
 * action reports as `steps[2].action` rather than as an unreadable union
 * error. `strictObject` everywhere means an unknown key is a failure naming
 * that key — a typo cannot silently do nothing.
 */
export const blockFrontmatterSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "must be kebab-case: lowercase letters, digits and single hyphens",
    ),
  title: z.string().min(1).optional(),
  version: z.number().int().min(1, "start at 1 and bump when the block's effects change"),
  rationale: z.string().min(1, "required: say why this component is installed at all"),
  dependsOn: z.array(z.string().min(1)).default([]),
  constraints: z.array(declaredConstraintSchema).default([]),
  installs: z.array(installedPathSchema).default([]),
  modifies: z.array(configChangeSchema).default([]),
  dshConfig: z.array(dshConfigChangeSchema).default([]),
  environment: z.array(environmentChangeSchema).default([]),
  commands: z.array(providedCommandSchema).default([]),
  integrations: z.array(integrationSchema).default([]),
  sideEffects: z.array(sideEffectSchema).default([]),
  steps: z.array(z.unknown()).min(1, "a block must do something: list at least one step"),
  detect: z
    .array(z.unknown())
    .min(1, "a block must be able to recognise itself: list at least one detect entry"),
  reverse: z.array(z.unknown()).optional(),
});

/** The frontmatter as parsed, before steps are matched to the registry. */
export type RawFrontmatter = z.infer<typeof blockFrontmatterSchema>;

// Compile-time proof that the documented interface and the validator describe
// the same object, minus the three step lists the loader types itself. If a
// field is added to one and not the other, typecheck fails here rather than at
// some call site months later.
type Declarative = Omit<BlockFrontmatter, "steps" | "detect" | "reverse">;
type Validated = Omit<RawFrontmatter, "steps" | "detect" | "reverse">;
function _schemaMatchesInterface(validated: Validated, declared: Declarative): void {
  const a: Declarative = validated;
  const b: Validated = declared;
  void a;
  void b;
}
void _schemaMatchesInterface;
