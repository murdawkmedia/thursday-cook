import { posix as posixPath } from "node:path";

import { Document, type Node, type YAMLMap, type YAMLSeq } from "yaml";

import type { Step } from "./actions";
import type { Block } from "./loader";
import { UPSTREAM_ROWS, type UpstreamRow, type UpstreamRowTable } from "./upstream";

/**
 * The profile composition patch, generated from the loaded block set.
 *
 * `sync.sh` wrote this file from a 115-line heredoc: the rows, their order,
 * their placement and the reasoning were all shell text, so adding a plugin
 * meant editing a shell script and getting three unwritten rules right from
 * memory. The rules are the whole problem, because every one of them kills
 * boot rather than degrading:
 *
 * 1. AN OWNED ID MAY NOT BE INSERTED. `dsh-base`, `dsh-web-app` and some
 *    plugins' own bundle patches already mount `llm-pi-ai`, `command-compact`
 *    and `remote`. A second row with the same id makes
 *    `cordis-plugin-loader` throw `duplicate loader entry id: <id>` and the
 *    profile does not start. Such a row must be a TOP-LEVEL override.
 * 2. AN OVERRIDE IS ASSIGNED WHOLESALE. `applyEntryPatches` finishes with
 *    `for (const [key, value] of Object.entries(overrides)) target[key] = value`
 *    — no deep merge — so an override supplying `config:` replaces the owner's
 *    entire `config:` and silently drops every default it did not restate.
 * 3. ORDER IS PART OF THE MEANING. `applyEntryPatches` indexes inserted rows
 *    as it goes, so a patch can only target a row an EARLIER patch inserted.
 *    Insert rows therefore come first and every top-level override after them.
 *
 * The generator enforces all three at generation time and refuses to write a
 * file that breaks one, naming the block that broke it. That refusal is the
 * entire value over a heredoc: a heredoc reproduces the rules, a generator
 * cannot stop obeying them.
 */

/** One reason the composition cannot be generated, naming its block. */
export interface PatchProblem {
  /** The block that caused it: its id, or its source path when it has none. */
  block: string;
  /** The loader entry id involved, when the problem is about one row. */
  row?: string;
  /** Where in the block it came from, e.g. `steps[2]`, `dshConfig[1]`. */
  where?: string;
  /** What is wrong, what it breaks, and what to write instead. */
  message: string;
}

/**
 * Thrown when the block set describes a composition that must not be written.
 *
 * Every problem is collected before throwing, for the same reason `BlockError`
 * does it: someone fixing a composition should see all of it at once. The
 * message names the target file and every offending block.
 */
export class PatchError extends Error {
  /** The patch file that was being generated. */
  readonly file: string;
  /** Every problem found, in block order. Never empty. */
  readonly problems: readonly PatchProblem[];

  constructor(file: string, problems: readonly PatchProblem[]) {
    const list = problems
      .map((p) => {
        const at = [p.block, p.where].filter((s) => s !== undefined && s !== "").join(" ");
        const row = p.row === undefined ? "" : ` row \`${p.row}\`:`;
        return `  - ${at}:${row} ${p.message}`;
      })
      .join("\n");
    const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
    super(`${file}: refusing to generate (${count})\n${list}`);
    this.name = "PatchError";
    this.file = file;
    this.problems = problems;
  }
}

/** One row the generator will write, with everything needed to explain it. */
export interface PatchRow {
  /** The loader entry id. */
  id: string;
  /** `insert` for a new row, `override` for a top-level row. */
  placement: "insert" | "override";
  /** The id of the block that produced it. */
  block: string;
  /** The block file it came from. */
  source: string;
  /** Where in the block, e.g. `steps[2]`. */
  where: string;
  /** The row exactly as emitted, `id` first. */
  entry: Record<string, unknown>;
  /** The reasons carried into the file as comments, longest first. */
  why: string[];
}

/** One value an override row changes, for the derived "what differs" comment. */
export interface OverrideDifference {
  /** Dotted path into the row, e.g. `config.session.secure`. */
  path: string;
  /** The owner's value, or undefined when the override adds the key. */
  from?: unknown;
  /** The value this composition sets. */
  to: unknown;
}

/** The generated composition: the text, and everything that went into it. */
export interface WebPatch {
  /** The path written, relative to the Thursday home. */
  file: string;
  /** The file's contents, ready to write. Ends with a newline. */
  yaml: string;
  /** Every row, insert rows first, in the order they are written. */
  rows: PatchRow[];
  /** Insert-list ids, in order. Order here is the mount order. */
  insertIds: string[];
  /** Top-level override ids, in order. */
  overrideIds: string[];
  /** What each override changes about its owner's row. */
  differences: Record<string, OverrideDifference[]>;
  /** Things worth saying that are not worth refusing to generate over. */
  warnings: PatchProblem[];
}

/** How to generate: where the home is, and what upstream is known to own. */
export interface WebPatchOptions {
  /**
   * Absolute path of the Thursday home.
   *
   * Blocks never write absolute paths — a block is data that has to be the
   * same on every machine — so a row value beginning `./` is resolved against
   * this. That is the one substitution the generator performs, and it is
   * performed on `name` and on every string inside `config`. A row that needs
   * a literal `./` string in its config therefore cannot have one; say so
   * rather than working around it.
   */
  dshHome: string;
  /**
   * The file being generated, relative to the home. Blocks declare rows
   * against this path in `dshConfig[].file`, and a declaration for any other
   * file is left alone.
   */
  file?: string;
  /**
   * Rows something upstream already mounts, keyed by id. Defaults to the
   * recorded snapshot; an installer should pass a table read from the real
   * bundle patches with `readBundleDefaults`, so the wholesale check compares
   * against the package actually installed.
   */
  upstreamRows?: UpstreamRowTable;
  /** Named in the file header, so a reader knows what rewrote it. */
  generator?: string;
}

const DEFAULT_FILE = "profiles/web/cordis.patch.yml";
const DEFAULT_GENERATOR = "generateWebPatch() in @thursday/install";
const COMMENT_WIDTH = 74;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blockName(block: Block): string {
  return block.frontmatter.id;
}

/** Collapse the whitespace a folded YAML scalar leaves in a `why`. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wrap(text: string, width: number): string[] {
  const words = tidy(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** Turn wrapped prose into the comment text the yaml writer expects. */
function comment(paragraphs: readonly string[]): string {
  const out: string[] = [];
  paragraphs.forEach((paragraph, i) => {
    if (i > 0) out.push("");
    for (const line of wrap(paragraph, COMMENT_WIDTH)) out.push(` ${line}`);
  });
  return out.join("\n");
}

/**
 * Resolve a home-relative value.
 *
 * `./plugins/see.js` becomes `<home>/plugins/see.js`; anything else — a
 * package name, a subpath export, an absolute path — is left exactly as
 * written, because those are not paths the installer owns.
 */
function resolveValue(value: unknown, home: string): unknown {
  if (typeof value === "string") {
    return value.startsWith("./") ? posixPath.join(home, value.slice(2)) : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, home));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolveValue(child, home);
    return out;
  }
  return value;
}

/** Every default key path an override failed to restate, in defaults order. */
function missingDefaults(
  defaults: unknown,
  given: unknown,
  path: string,
  out: string[],
): void {
  if (!isPlainObject(defaults) || !isPlainObject(given)) return;
  for (const [key, value] of Object.entries(defaults)) {
    const at = path === "" ? key : `${path}.${key}`;
    if (!(key in given)) {
      out.push(at);
      continue;
    }
    missingDefaults(value, given[key], at, out);
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** What an override actually changes about its owner's row, leaf by leaf. */
function differences(
  defaults: unknown,
  given: unknown,
  path: string,
  out: OverrideDifference[],
): void {
  if (isPlainObject(given) && isPlainObject(defaults)) {
    for (const [key, value] of Object.entries(given)) {
      differences(defaults[key], value, path === "" ? key : `${path}.${key}`, out);
    }
    return;
  }
  if (isPlainObject(given) && defaults === undefined) {
    for (const [key, value] of Object.entries(given)) {
      differences(undefined, value, path === "" ? key : `${path}.${key}`, out);
    }
    return;
  }
  if (sameValue(defaults, given)) return;
  out.push(defaults === undefined ? { path, to: given } : { path, from: defaults, to: given });
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/**
 * Order the blocks the way the installer runs them.
 *
 * A stable topological sort on `dependsOn`: a block never precedes a block it
 * depends on, and independent blocks keep the order they were given, because
 * insert-row order IS mount order and must not depend on a sort's tie-break.
 * Dependencies outside the set are ignored — `dsh-runtime` is a dependency no
 * composition row comes from.
 */
export function orderBlocks(blocks: readonly Block[]): Block[] {
  const remaining = [...blocks];
  const present = new Set(blocks.map(blockName));
  const done = new Set<string>();
  const ordered: Block[] = [];

  while (remaining.length > 0) {
    const index = remaining.findIndex((block) =>
      block.frontmatter.dependsOn.every((id) => !present.has(id) || done.has(id)),
    );
    if (index === -1) {
      const stuck = remaining.map(blockName).join(", ");
      throw new PatchError(DEFAULT_FILE, [
        {
          block: stuck,
          message: `dependsOn forms a cycle, so there is no install order and no row order: ${stuck}`,
        },
      ]);
    }
    const [block] = remaining.splice(index, 1);
    if (block === undefined) continue;
    ordered.push(block);
    done.add(blockName(block));
  }
  return ordered;
}

interface Declaration {
  placement: "insert" | "override";
  why: string;
  where: string;
}

function declarations(block: Block, file: string): Map<string, Declaration> {
  const map = new Map<string, Declaration>();
  block.frontmatter.dshConfig.forEach((change, i) => {
    if (change.file !== file) return;
    change.rows.forEach((row) => {
      map.set(row, { placement: change.placement, why: change.why, where: `dshConfig[${i}]` });
    });
  });
  return map;
}

/** The row a composition step writes, or undefined for a step that writes none. */
function rowFromStep(
  step: Step,
  home: string,
): { id: string; placement: "insert" | "override"; entry: Record<string, unknown> } | undefined {
  if (step.action === "patch-row") {
    const entry: Record<string, unknown> = {};
    if (step.name !== undefined) entry["name"] = resolveValue(step.name, home);
    if (step.config !== undefined) entry["config"] = resolveValue(step.config, home);
    return { id: step.id, placement: step.placement, entry };
  }
  // `disable-row` and `enable-row` exist only to flip a row someone else
  // owns, so their placement is not a choice an author can get wrong.
  if (step.action === "disable-row") {
    return { id: step.id, placement: "override", entry: { disabled: true } };
  }
  if (step.action === "enable-row") {
    return { id: step.id, placement: "override", entry: { disabled: false } };
  }
  return undefined;
}

interface Plan {
  rows: PatchRow[];
  differences: Record<string, OverrideDifference[]>;
  problems: PatchProblem[];
  warnings: PatchProblem[];
}

/**
 * Work out every row and every reason to refuse, without writing anything.
 *
 * Exported because the refusal is the interesting half: a caller that wants
 * to report problems rather than throw them (a `thursday check`, a test) can
 * read them here.
 */
export function planWebPatch(blocks: readonly Block[], options: WebPatchOptions): Plan {
  const file = options.file ?? DEFAULT_FILE;
  const upstream: UpstreamRowTable = options.upstreamRows ?? UPSTREAM_ROWS;
  const home = options.dshHome;
  const problems: PatchProblem[] = [];
  const warnings: PatchProblem[] = [];
  const rows: PatchRow[] = [];
  const diffs: Record<string, OverrideDifference[]> = {};

  const owner = (id: string): UpstreamRow | undefined => upstream[id];

  for (const block of orderBlocks(blocks)) {
    const name = blockName(block);
    const declared = declarations(block, file);
    const written = new Set<string>();
    // One `dshConfig` entry can cover many rows, and its `why` is about all of
    // them. Carrying it onto every row would print the same paragraph eleven
    // times, so it is emitted once, above the first row it covers.
    const explained = new Set<string>();

    // RULE 1, on the declaration. A block that declares an owned id as an
    // insert is wrong before a single step runs, and saying so here names the
    // field an author has to edit.
    for (const [id, declaration] of declared) {
      const known = owner(id);
      if (declaration.placement === "insert" && known !== undefined) {
        problems.push({
          block: name,
          row: id,
          where: declaration.where,
          message: `declared with \`placement: insert\`, but ${known.owner} already mounts \`${id}\` (${known.origin}). A second row with that id kills boot with "duplicate loader entry id: ${id}". Declare it \`placement: override\` so it is written as a top-level row.`,
        });
      }
    }

    block.frontmatter.steps.forEach((step, i) => {
      const where = `steps[${i}]`;
      const produced = rowFromStep(step, home);
      if (produced === undefined) return;
      const { id, placement, entry } = produced;
      written.add(id);

      const known = owner(id);

      // RULE 1, on the step itself.
      if (placement === "insert" && known !== undefined) {
        problems.push({
          block: name,
          row: id,
          where,
          message: `writes \`${id}\` into the insert list, but ${known.owner} already mounts it (${known.origin}). A second row with that id kills boot with "duplicate loader entry id: ${id}". Use \`placement: override\` — the row is then written at the top level, where it patches the existing entry instead of adding one.`,
        });
        return;
      }

      // The block's own declaration and its own step must agree, or the
      // record `thursday status` reads is a description of a different file.
      const declaration = declared.get(id);
      if (declaration === undefined) {
        problems.push({
          block: name,
          row: id,
          where,
          message: `writes row \`${id}\` into ${file}, but no \`dshConfig\` entry for that file declares it. Add it, with the reason the row exists: an undeclared row cannot be attributed to a block later.`,
        });
      } else if (declaration.placement !== placement) {
        problems.push({
          block: name,
          row: id,
          where,
          message: `writes the row as \`${placement}\`, but ${declaration.where} declares it as \`${declaration.placement}\`. One of the two is wrong, and the placement is the thing that kills boot.`,
        });
      }

      if (placement === "override") {
        if (known === undefined) {
          // `applyEntryPatches` warns and skips a patch that matches nothing,
          // so this is a row that quietly does not happen — bad, but not a
          // reason to refuse a whole composition.
          warnings.push({
            block: name,
            row: id,
            where,
            message: `overrides \`${id}\`, which nothing known upstream mounts. applyEntryPatches warns "patch: entry ${id} not found" and skips it, so the row would silently do nothing — and its defaults cannot be checked.`,
          });
        } else {
          // RULE 2. Every object-valued key this override supplies replaces
          // the owner's whole value, so it must restate the owner's keys.
          const missing: string[] = [];
          for (const [key, value] of Object.entries(entry)) {
            const fallback = known.defaults[key];
            if (!isPlainObject(value) || !isPlainObject(fallback)) continue;
            missingDefaults(fallback, value, key, missing);
          }
          if (missing.length > 0) {
            problems.push({
              block: name,
              row: id,
              where,
              message: `overrides \`${id}\` but drops ${missing.length === 1 ? "a default" : "defaults"} ${missing.map((m) => `\`${m}\``).join(", ")}. applyEntryPatches assigns each key WHOLESALE (target[key] = value), so an override does not merge with ${known.owner}'s row (${known.origin}) — it replaces it, and every key not restated here is gone at boot. Restate them, changing only what this composition means to change.`,
            });
          }
          const found: OverrideDifference[] = [];
          differences(known.defaults, entry, "", found);
          if (found.length > 0) diffs[id] = found;
        }
      }

      const why: string[] = [];
      if (declaration !== undefined && !explained.has(declaration.where)) {
        explained.add(declaration.where);
        why.push(tidy(declaration.why));
      }
      const stepWhy = typeof step.why === "string" ? tidy(step.why) : "";
      if (stepWhy !== "" && !why.includes(stepWhy)) why.push(stepWhy);

      rows.push({
        id,
        placement,
        block: name,
        source: block.source,
        where,
        entry: { id, ...entry },
        why,
      });
    });

    // A declared row nothing writes is a claim the file does not support.
    for (const [id, declaration] of declared) {
      if (written.has(id)) continue;
      problems.push({
        block: name,
        row: id,
        where: declaration.where,
        message: `declares row \`${id}\` in ${file}, but no step writes it. Either add the step or drop the declaration; a claim nothing backs is what \`thursday status\` would print as fact.`,
      });
    }
  }

  // RULE 1 again, between blocks this time: the loader's duplicate check is
  // over the whole group, so two blocks inserting one id is the same crash as
  // one block inserting an id dsh-base owns.
  const byId = new Map<string, PatchRow>();
  for (const row of rows) {
    const key = `${row.placement}:${row.id}`;
    const first = byId.get(key);
    if (first === undefined) {
      byId.set(key, row);
      continue;
    }
    problems.push(
      row.placement === "insert"
        ? {
            block: `${first.block} and ${row.block}`,
            row: row.id,
            where: `${first.where} / ${row.where}`,
            message: `both insert \`${row.id}\`. The loader rejects a group with a repeated id: boot dies with "duplicate loader entry id: ${row.id}". One of the two blocks owns the row; the other names it.`,
          }
        : {
            block: `${first.block} and ${row.block}`,
            row: row.id,
            where: `${first.where} / ${row.where}`,
            message: `both override \`${row.id}\`. Overrides are applied in order and assigned wholesale, so the later one silently wins and the earlier block's intent disappears. Merge them into one row in one block.`,
          },
    );
  }

  return { rows, differences: diffs, problems, warnings };
}

/**
 * Generate the profile composition patch from a set of loaded blocks.
 *
 * Throws `PatchError` — naming the block, the row and the field — rather than
 * returning a file that would not boot.
 */
export function generateWebPatch(
  blocks: readonly Block[],
  options: WebPatchOptions,
): WebPatch {
  const file = options.file ?? DEFAULT_FILE;
  const upstream: UpstreamRowTable = options.upstreamRows ?? UPSTREAM_ROWS;
  const plan = planWebPatch(blocks, options);
  if (plan.problems.length > 0) throw new PatchError(file, plan.problems);

  // RULE 3. Insert rows first, in block order then step order; every
  // top-level override after them. applyEntryPatches indexes rows as it
  // inserts them, so this is the only arrangement in which an override may
  // target a row this same file inserted.
  const inserts = plan.rows.filter((row) => row.placement === "insert");
  const overrides = plan.rows.filter((row) => row.placement === "override");
  const ordered = [...inserts, ...overrides];

  const top: unknown[] = [];
  if (inserts.length > 0) top.push({ insert: inserts.map((row) => row.entry) });
  for (const row of overrides) top.push(row.entry);

  const doc = new Document();
  doc.contents = doc.createNode(top);
  doc.commentBefore = comment(header(plan.rows, blocks.length, options));

  const root = doc.contents as unknown as YAMLSeq;
  const nodes: Node[] = [];
  if (inserts.length > 0) {
    const group = root.items[0] as unknown as YAMLMap;
    const seq = group.get("insert", true) as unknown as YAMLSeq;
    for (const item of seq.items) nodes.push(item as Node);
  }
  const offset = inserts.length > 0 ? 1 : 0;
  overrides.forEach((_, i) => nodes.push(root.items[offset + i] as Node));

  let previousBlock = "";
  ordered.forEach((row, i) => {
    const node = nodes[i];
    if (node === undefined) return;
    const paragraphs: string[] = [];
    if (row.block !== previousBlock) {
      const block = blocks.find((b) => b.frontmatter.id === row.block);
      const rationale = block === undefined ? "" : tidy(block.frontmatter.rationale);
      paragraphs.push(`── ${row.block} ${"─".repeat(Math.max(3, 60 - row.block.length))}`);
      if (rationale !== "") paragraphs.push(rationale);
      previousBlock = row.block;
      node.spaceBefore = true;
    }
    for (const why of row.why) paragraphs.push(why);
    const found = plan.differences[row.id];
    const known = upstream[row.id];
    if (found !== undefined && known !== undefined) {
      paragraphs.push(
        `Assigned wholesale over ${known.owner}'s row (${known.origin}). Everything above is restated from that row; only these values differ: ` +
          found
            .map((d) =>
              d.from === undefined
                ? `${d.path} = ${show(d.to)} (added)`
                : `${d.path} = ${show(d.to)} (was ${show(d.from)})`,
            )
            .join("; "),
      );
    }
    if (paragraphs.length > 0) node.commentBefore = comment(paragraphs);
  });

  const yaml = doc.toString({ lineWidth: 0 });

  return {
    file,
    yaml,
    rows: ordered,
    insertIds: inserts.map((row) => row.id),
    overrideIds: overrides.map((row) => row.id),
    differences: plan.differences,
    warnings: plan.warnings,
  };
}

function header(rows: readonly PatchRow[], blockCount: number, options: WebPatchOptions): string[] {
  const contributing = [...new Set(rows.map((row) => row.block))];
  return [
    `Auto-generated by ${options.generator ?? DEFAULT_GENERATOR} from ${blockCount} install ${blockCount === 1 ? "block" : "blocks"}. Do not hand-edit: an edit here is overwritten on the next install, and the reason for it is lost. Change the block instead.`,
    `Host-plane rows: these apply to EVERY session regardless of preset. ${rows.length} ${rows.length === 1 ? "row" : "rows"} from ${contributing.length} ${contributing.length === 1 ? "block" : "blocks"}: ${contributing.join(", ")}.`,
    "The insert list comes first and every top-level row after it. A top-level row is an OVERRIDE of an entry another layer already mounts: it must never appear inside the insert list, because a repeated id kills boot with \"duplicate loader entry id\". applyEntryPatches assigns each override key wholesale rather than merging it, so an override restates every default of the row it patches; the comment on each one records what it actually changes.",
  ];
}
