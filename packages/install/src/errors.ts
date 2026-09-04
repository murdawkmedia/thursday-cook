/**
 * One validation failure, naming the frontmatter field that caused it.
 *
 * `field` is a path into the block's frontmatter as an author would write it
 * (`id`, `modifies[1].why`, `steps[0].action`), not a JSON pointer, because
 * the person reading the message is looking at YAML.
 */
export interface BlockProblem {
  /** Frontmatter path of the offending field, e.g. `steps[0].spec`. */
  field: string;
  /** What is wrong with it, in one sentence, with the fix if there is one. */
  message: string;
}

/**
 * Thrown when a block file cannot be parsed or fails validation.
 *
 * Every problem found is collected before throwing: an author fixing a block
 * should see all of its faults at once rather than one per run. The message
 * names the source file and every bad field.
 */
export class BlockError extends Error {
  /** Where the block came from: a file path, or `<inline>` for a string. */
  readonly source: string;
  /** Every problem found, in frontmatter order. Never empty. */
  readonly problems: readonly BlockProblem[];

  constructor(source: string, problems: readonly BlockProblem[]) {
    const list = problems.map((p) => `  - ${p.field}: ${p.message}`).join("\n");
    const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
    super(`${source}: invalid block (${count})\n${list}`);
    this.name = "BlockError";
    this.source = source;
    this.problems = problems;
  }
}
