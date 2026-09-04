import { z } from "zod";

/**
 * A named constraint a block can declare, and the installer must honour.
 *
 * Constraints are the machine-readable half of a block's knowledge. `sync.sh`
 * carried this knowledge in comments, where nothing could read it: the
 * installer could not check it, `thursday status` could not print it, and a
 * rewrite could not fail a test for dropping it. A constraint is data, so the
 * action that would otherwise violate it can refuse to.
 *
 * Adding a constraint is deliberate and rare. It goes here, with its origin,
 * and an action must be taught to honour it; a block cannot invent one, and
 * an unknown name fails validation naming the field that carried it.
 */
export interface ConstraintDefinition {
  /** The name a block writes, kebab-case. */
  readonly name: string;
  /** One line: what the installer must do, or must never do. */
  readonly summary: string;
  /**
   * What goes wrong when it is ignored. This is the paragraph someone loses a
   * day to otherwise, so it is stated in terms of the observed failure.
   */
  readonly failureMode: string;
  /** Action names that implement this constraint; the rest ignore it. */
  readonly honouredBy: readonly string[];
  /** Where the knowledge came from, for anyone who wants the original. */
  readonly origin: string;
}

/**
 * Every constraint Thursday knows. Keyed by the name blocks write.
 */
export const CONSTRAINTS = {
  "top-level-override": {
    name: "top-level-override",
    summary:
      "The row must be written as a top-level override in the dsh composition patch, never as a child of the insert list.",
    failureMode:
      "dsh-base already owns these ids. A second row with the same id kills boot with 'duplicate loader entry id: <id>'. Seen with command-compact, remote and llm-pi-ai. Overrides are also assigned wholesale rather than deep-merged, so an override must restate every default it wants to keep.",
    honouredBy: ["patch-row", "disable-row", "enable-row"],
    origin: "dotfiles-ai/sync.sh:163-213 (llm-pi-ai, command-compact, remote)",
  },
  "no-yaml-round-trip": {
    name: "no-yaml-round-trip",
    summary: "Patch the file by line, byte-preserving. Never load and re-serialise it.",
    failureMode:
      "A full round-trip through a YAML 1.1 reader (PyYAML) turns the reasoningEfforts key `off:` into the boolean `false`, the llm-pi-ai schema then rejects the settings file, and every pi-ai provider silently disappears. A round-trip also drops comments and rewrites indentation, making the diff unreviewable.",
    honouredBy: ["write-settings-key", "settings-key-equals"],
    origin: "dotfiles-ai/sync.sh:786-789, 1136-1145",
  },
  "needs-allow-builds": {
    name: "needs-allow-builds",
    summary:
      "The package's resolved tarball URL must be listed under allowBuilds in the profile's pnpm-workspace.yaml before install.",
    failureMode:
      "pnpm 10+ refuses to run a package's lifecycle scripts (prepare/postinstall) unless its exact resolved tarball URL is allow-listed. The package installs, its build never runs, and the failure shows up later as a missing dist. The URL is not stated by the block: it is reconstructed from the git spec the way pnpm does it (owner/repo#ref -> https://codeload.github.com/owner/repo/tar.gz/ref, key name = repo basename), so bumping a pin is the whole upgrade.",
    honouredBy: ["pnpm-add"],
    origin: "dotfiles-ai/sync.sh:33-38, 445-473",
  },
  "alias-install-name": {
    name: "alias-install-name",
    summary:
      "Install the package under a different package name than its own, shadowing the name it aliases.",
    failureMode:
      "A package that ships its own dsh.bundle patch inserts its rows on install. When those rows duplicate ones the profile patch already inserts, boot dies on a duplicate loader entry id. Installing under the aliased name shadows the builtin instead of adding to it: the fork of dsh-compaction-instant installs as @deepseek-ai/dsh-compaction-basic, and the patch names the basic package for all three rows.",
    honouredBy: ["pnpm-add"],
    origin: "dotfiles-ai/sync.sh:267-295",
  },
  "nested-tool-config": {
    name: "nested-tool-config",
    summary: "The key belongs inside the row's own `config:` block, not beside it.",
    failureMode:
      "A tool declares its options inside its own Config schema and reads them from config.<key> — dsh-tool-subagent declares agentOptions in `Config = z.object({...})` and reads `config.agentOptions`. A sibling key beside `config:` parses fine and is then ignored, so the setting silently does nothing: every subagent keeps inheriting the orchestrator's creation route.",
    honouredBy: ["patch-row", "write-settings-key"],
    origin: "dotfiles-ai/sync.sh:800-812, 851-876",
  },
} as const satisfies Record<string, ConstraintDefinition>;

/** The name of a constraint Thursday knows. */
export type ConstraintName = keyof typeof CONSTRAINTS;

/** Every known constraint name, for messages and for the schema. */
export const CONSTRAINT_NAMES = Object.keys(CONSTRAINTS) as [ConstraintName, ...ConstraintName[]];

/** Validates a constraint name against the registry above. */
export const constraintNameSchema = z
  .enum(CONSTRAINT_NAMES)
  .describe("A named constraint from the constraint registry.");

/** Look up a constraint definition by name, or undefined if unknown. */
export function findConstraint(name: string): ConstraintDefinition | undefined {
  return (CONSTRAINTS as Record<string, ConstraintDefinition>)[name];
}
