import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  DETECT_ACTIONS,
  INSTALL_ACTIONS,
  validateStepList,
  type ActionDefinition,
  type DetectStep,
  type Step,
} from "./actions";
import {
  CONSTRAINTS,
  findConstraint,
  type ConstraintDefinition,
  type ConstraintName,
} from "./constraints";
import { BlockError, type BlockProblem } from "./errors";
import { blockFrontmatterSchema, type BlockFrontmatter } from "./schema";

/**
 * One constraint as the loader reports it: the declaration, plus where in the
 * block it was declared, plus the registry entry that says what it means.
 *
 * This is the answer to "what does this block need the installer to be careful
 * about", available without walking the frontmatter by hand. The installer
 * reads it before running an action, and `thursday status` prints it.
 */
export interface SurfacedConstraint {
  /** The constraint name. */
  name: ConstraintName;
  /** Why this block declared it, in the block's own words. */
  why: string;
  /** Where it was declared, e.g. `dshConfig[0]`, `steps[1]`, `constraints[0]`. */
  where: string;
  /** What the constraint means and what breaks when it is ignored. */
  definition: ConstraintDefinition;
}

/** A parsed, validated block: its data, its prose, and its constraints. */
export interface Block {
  /** Where it came from: a file path, or `<inline>` for a parsed string. */
  source: string;
  /** The validated frontmatter. */
  frontmatter: BlockFrontmatter;
  /**
   * The markdown body: what this component is, what breaks without it, what to
   * check when it goes wrong. Not parsed, not interpreted, never a source of
   * behaviour — behaviour comes from `steps` alone, so prose and code cannot
   * diverge into two implementations.
   */
  body: string;
  /** Every constraint the block declares anywhere, flattened. */
  constraints: SurfacedConstraint[];
}

// Keys that would turn frontmatter into a programming language. The format
// rejects them by name rather than by convention, because every YAML-driven
// installer that grew conditionals grew them one harmless key at a time.
const LOGIC_KEYS = new Set([
  "if",
  "else",
  "elif",
  "unless",
  "when",
  "cond",
  "condition",
  "for",
  "each",
  "loop",
  "while",
  "matrix",
  "template",
  "expr",
]);

// Templating markers, for the same reason: a value the loader would have to
// evaluate is a value no reviewer can read.
const TEMPLATE_MARKERS = ["${{", "{{", "}}", "${"];

function splitFrontmatter(
  text: string,
  source: string,
): { yaml: string; body: string; problems: BlockProblem[] } {
  const problems: BlockProblem[] = [];
  const normalised = text.replace(/^\uFEFF/, "");
  const lines = normalised.split("\n");
  if (lines[0]?.trim() !== "---") {
    problems.push({
      field: "frontmatter",
      message: "a block must start with a `---` line opening its YAML frontmatter",
    });
    return { yaml: "", body: normalised, problems };
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    problems.push({
      field: "frontmatter",
      message: "the YAML frontmatter is never closed by a `---` line",
    });
    return { yaml: "", body: "", problems };
  }
  void source;
  return {
    yaml: lines.slice(1, end).join("\n"),
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n+/, ""),
    problems,
  };
}

function checkNoLogic(value: unknown, path: string, problems: BlockProblem[]): void {
  if (typeof value === "string") {
    for (const marker of TEMPLATE_MARKERS) {
      if (value.includes(marker)) {
        problems.push({
          field: path,
          message: `contains the templating marker \`${marker}\`; frontmatter is data, so a value that has to be evaluated belongs in an action's TypeScript`,
        });
        return;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => checkNoLogic(item, `${path}[${i}]`, problems));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const at = path === "" ? key : `${path}.${key}`;
      if (LOGIC_KEYS.has(key)) {
        problems.push({
          field: at,
          message: `\`${key}\` is control flow, and frontmatter carries no logic: no conditionals, no loops, no templating. Anything conditional is an action that decides in TypeScript, where it can be tested`,
        });
        continue;
      }
      checkNoLogic(child, at, problems);
    }
  }
}

function surfaceConstraints(
  frontmatter: BlockFrontmatter,
  problems: BlockProblem[],
): SurfacedConstraint[] {
  const found: SurfacedConstraint[] = [];

  frontmatter.constraints.forEach((declared, i) => {
    found.push({
      name: declared.name,
      why: declared.why,
      where: `constraints[${i}]`,
      definition: CONSTRAINTS[declared.name],
    });
  });

  const carriers: Array<{
    field: string;
    items: Array<{ constraint?: ConstraintName; why: string }>;
  }> = [
    { field: "modifies", items: frontmatter.modifies },
    { field: "dshConfig", items: frontmatter.dshConfig },
  ];
  for (const carrier of carriers) {
    carrier.items.forEach((item, i) => {
      if (item.constraint === undefined) return;
      found.push({
        name: item.constraint,
        why: item.why,
        where: `${carrier.field}[${i}]`,
        definition: CONSTRAINTS[item.constraint],
      });
    });
  }

  const stepLists: Array<{
    field: string;
    steps: Array<Step | DetectStep>;
    registry: Record<string, ActionDefinition>;
  }> = [
    {
      field: "steps",
      steps: frontmatter.steps,
      registry: INSTALL_ACTIONS,
    },
    {
      field: "detect",
      steps: frontmatter.detect,
      registry: DETECT_ACTIONS,
    },
    {
      field: "reverse",
      steps: frontmatter.reverse ?? [],
      registry: INSTALL_ACTIONS,
    },
  ];
  for (const list of stepLists) {
    list.steps.forEach((step, i) => {
      const names = Array.isArray(step.constraint)
        ? step.constraint
        : step.constraint === undefined
          ? []
          : [step.constraint];
      for (const name of names) {
        const definition = CONSTRAINTS[name];
        const action = list.registry[step.action];
        // A constraint no action honours is knowledge that would never be
        // acted on, which is the failure this whole field exists to prevent.
        if (action !== undefined && !action.honours.includes(name)) {
          problems.push({
            field: `${list.field}[${i}].constraint`,
            message: `action \`${step.action}\` does not honour \`${name}\`; it is honoured by: ${definition.honouredBy.join(", ")}`,
          });
          continue;
        }
        found.push({
          name,
          why: step.why ?? "",
          where: `${list.field}[${i}]`,
          definition,
        });
      }
    });
  }

  return found;
}

/**
 * The wholesale-override check, enforced at load.
 *
 * Override assignment in dsh is wholesale (`target[key] = value`), so an
 * override `patch-row` that carries a `config:` key replaces the base row's
 * entire config object. A block that does that must declare
 * `wholesale-override-config` so the obligation to restate every default is
 * recorded next to the step that has it; leaving it off is exactly the
 * silent-default-dropping bug, so it is refused here rather than trusted to
 * review. Overrides without a `config:` (a bare `disabled: true`, say) are
 * exempt: there is nothing to restate.
 */
function checkWholesaleOverrideConfig(
  steps: ReadonlyArray<Step>,
  field: string,
  problems: BlockProblem[],
): void {
  steps.forEach((step, i) => {
    if (step.action !== "patch-row") return;
    if (step.placement !== "override") return;
    if (step.config === undefined) return;
    const declared = Array.isArray(step.constraint)
      ? step.constraint
      : step.constraint === undefined
        ? []
        : [step.constraint];
    if (declared.includes("wholesale-override-config")) return;
    problems.push({
      field: `${field}[${i}].constraint`,
      message: `this override row carries a \`config:\` key, which replaces the base row's whole config object; the override must restate every default it wants to keep. Declare \`constraint: wholesale-override-config\` to record that obligation${step.constraint === undefined ? "" : ` (this step declares \`${Array.isArray(step.constraint) ? step.constraint.join(", ") : String(step.constraint)}\`, which covers placement only)`}`,
    });
  });
}

/**
 * Parse and validate one block from its markdown text.
 *
 * Throws BlockError listing every problem found, each naming its field.
 */
export function parseBlock(text: string, source = "<inline>"): Block {
  const split = splitFrontmatter(text, source);
  if (split.problems.length > 0) throw new BlockError(source, split.problems);

  let data: unknown;
  try {
    data = parseYaml(split.yaml);
  } catch (err) {
    throw new BlockError(source, [
      { field: "frontmatter", message: `not valid YAML: ${(err as Error).message}` },
    ]);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new BlockError(source, [
      { field: "frontmatter", message: "expected a YAML mapping of fields" },
    ]);
  }

  const problems: BlockProblem[] = [];
  checkNoLogic(data, "", problems);

  const parsed = blockFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path
        .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
        .join("")
        .replace(/^\./, "");
      problems.push({ field: path === "" ? "frontmatter" : path, message: issue.message });
    }
    throw new BlockError(source, problems);
  }

  const steps = validateStepList(parsed.data.steps, "install", "steps", problems);
  const detect = validateStepList(parsed.data.detect, "detect", "detect", problems);
  const reverse =
    parsed.data.reverse === undefined
      ? undefined
      : validateStepList(parsed.data.reverse, "install", "reverse", problems);

  const frontmatter = {
    ...parsed.data,
    steps: steps as Step[],
    detect: detect as DetectStep[],
    ...(reverse === undefined ? {} : { reverse: reverse as Step[] }),
  } as BlockFrontmatter;

  checkWholesaleOverrideConfig(frontmatter.steps, "steps", problems);
  if (frontmatter.reverse !== undefined) {
    checkWholesaleOverrideConfig(frontmatter.reverse, "reverse", problems);
  }

  const constraints = surfaceConstraints(frontmatter, problems);
  if (problems.length > 0) throw new BlockError(source, problems);

  return { source, frontmatter, body: split.body, constraints };
}

/** Read one block file from disk and validate it. */
export function loadBlockFile(path: string): Block {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new BlockError(path, [
      { field: "frontmatter", message: `cannot read: ${(err as Error).message}` },
    ]);
  }
  return parseBlock(text, path);
}

/** Every constraint of one name that the block declared, in declaration order. */
export function constraintsNamed(block: Block, name: ConstraintName): SurfacedConstraint[] {
  return block.constraints.filter((c) => c.name === name);
}

/** True when the block declares the named constraint anywhere. */
export function hasConstraint(block: Block, name: string): boolean {
  return findConstraint(name) !== undefined && block.constraints.some((c) => c.name === name);
}

/**
 * Load every block in a directory.
 *
 * The composition is a DIRECTORY OF FILES, not a manifest listing them: adding
 * a block is adding a file, and there is no second place to forget to update.
 * That is the same reason the tour's plan is data and the phrase set is data —
 * a list that must be kept in sync with the thing it lists eventually is not.
 *
 * ORDER IS NOT DECIDED HERE. `planInstall` runs `orderBlocks`, which resolves
 * dependencies; this returns them sorted by filename purely so the RESULT is
 * deterministic and a diff of two loads is readable. Sorting by name would be a
 * bug if it were load-bearing, so it deliberately is not.
 *
 * EVERY BAD FILE IS REPORTED, not just the first. A loader that stops at the
 * first failure makes fixing five broken blocks five edit-run cycles, and the
 * person doing that is usually mid-install with no idea how many remain.
 *
 * @param dir - directory holding `*.md` blocks.
 * @param options.ignore - basenames to skip; defaults to README.md, which is
 *   documentation living beside the blocks rather than a block.
 */
export function loadBlockDir(
  dir: string,
  options?: { readonly ignore?: readonly string[] },
): Block[] {
  const ignore = new Set(options?.ignore ?? ["README.md"]);

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    throw new BlockError(`cannot read block directory ${dir}`, [
      { field: dir, message: String((error as Error).message ?? error) },
    ]);
  }

  const files = entries
    .filter((name) => name.endsWith(".md") && !ignore.has(name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const blocks: Block[] = [];
  const problems: BlockProblem[] = [];
  for (const name of files) {
    const path = join(dir, name);
    try {
      blocks.push(loadBlockFile(path));
    } catch (error) {
      // Keep going: the caller wants every problem in one pass.
      problems.push({ field: path, message: String((error as Error).message ?? error) });
    }
  }

  if (problems.length > 0) {
    throw new BlockError(
      `${problems.length} of ${files.length} block file(s) in ${dir} could not be loaded`,
      problems,
    );
  }
  return blocks;
}
