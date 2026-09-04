import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONSTRAINTS } from "../src/constraints";
import { constraintsNamed, loadBlockFile } from "../src/loader";

// The five facts sync.sh recorded in comments, and where each one lives now.
// A schema with no field for a fact deletes it in translation, so this file
// asserts the destination of each one against a block that actually loads.
const example = (name: string) => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));

describe("sync.sh's comments have somewhere to live", () => {
  it("1. the compaction fork installs under the basic package name", () => {
    // dotfiles-ai/sync.sh:267-272,295
    const b = loadBlockFile(example("compaction-instant.md"));
    const step = b.frontmatter.steps[0];

    // The alias itself is a typed parameter, not a comment on a shell line.
    expect(step).toMatchObject({
      action: "pnpm-add",
      as: "@deepseek-ai/dsh-compaction-basic",
      constraint: "alias-install-name",
    });
    // The reason is carried twice on purpose: once per block, as prose, and
    // once per step, next to the thing it explains.
    expect(b.frontmatter.constraints[0]?.why).toContain("duplicate loader entry id");
    expect(constraintsNamed(b, "alias-install-name")[1]?.why).toContain(
      "boot dies on a duplicate loader entry id",
    );
    expect(CONSTRAINTS["alias-install-name"].failureMode).toContain("dsh.bundle patch");
  });

  it("2. three rows must be top-level overrides, not children of the insert list", () => {
    // dotfiles-ai/sync.sh:163-213
    const piAi = loadBlockFile(example("llm-pi-ai.md"));
    const compaction = loadBlockFile(example("compaction-instant.md"));

    // Placement is a first-class enum on the dsh change and on the action, so
    // "top-level row, not a child" is checkable rather than remembered.
    const override = piAi.frontmatter.dshConfig[1];
    expect(override).toMatchObject({
      rows: ["llm-pi-ai"],
      placement: "override",
      constraint: "top-level-override",
    });
    expect(override?.why).toContain("duplicate loader entry id");
    expect(compaction.frontmatter.dshConfig[1]).toMatchObject({
      rows: ["command-compact"],
      placement: "override",
      constraint: "top-level-override",
    });
    // The third row, `remote`, is a config override on the same footing.
    expect(CONSTRAINTS["top-level-override"].failureMode).toContain("command-compact, remote");
    expect(constraintsNamed(piAi, "top-level-override").map((c) => c.where)).toEqual([
      "dshConfig[1]",
      "steps[2]",
    ]);
  });

  it("3. the settings file must never take a full YAML round-trip", () => {
    // dotfiles-ai/sync.sh:1136-1145
    const b = loadBlockFile(example("thursday-defaults.md"));

    expect(b.frontmatter.modifies[0]).toMatchObject({
      file: "settings.yaml",
      key: "profile.active",
      constraint: "no-yaml-round-trip",
    });
    expect(b.frontmatter.modifies[0]?.why).toContain("reasoningEfforts");
    expect(CONSTRAINTS["no-yaml-round-trip"].failureMode).toContain("every pi-ai provider");
    // The action that writes the file is the one that honours the constraint.
    expect(CONSTRAINTS["no-yaml-round-trip"].honouredBy).toContain("write-settings-key");
  });

  it("4. allowBuilds needs a reconstructed codeload tarball URL", () => {
    // dotfiles-ai/sync.sh:33-38, 445-473
    const b = loadBlockFile(example("aidos.md"));

    expect(b.frontmatter.modifies[0]).toMatchObject({
      file: "profiles/web/pnpm-workspace.yaml",
      key: "allowBuilds",
      constraint: "needs-allow-builds",
    });
    expect(b.frontmatter.modifies[0]?.why).toContain("codeload");
    // The block states the need; the installer derives the URL, because the
    // URL changes with every pin bump and a block must not restate it.
    expect(b.frontmatter.steps[0]).toMatchObject({ action: "pnpm-add", allowBuilds: true });
    expect(CONSTRAINTS["needs-allow-builds"].failureMode).toContain("codeload.github.com");
  });

  it("5. agentOptions nests inside the tool's own config block", () => {
    // dotfiles-ai/sync.sh:800-812
    const b = loadBlockFile(example("thursday-defaults.md"));

    expect(b.frontmatter.modifies[1]).toMatchObject({
      file: "presets/standard.yaml",
      key: "tools.tool-subagent.config.agentOptions",
      constraint: "nested-tool-config",
    });
    expect(b.frontmatter.modifies[1]?.why).toContain("Config schema");
    expect(b.frontmatter.steps[2]).toMatchObject({
      action: "write-settings-key",
      key: "tools.tool-subagent.config.agentOptions",
    });
    expect(CONSTRAINTS["nested-tool-config"].failureMode).toContain("silently does nothing");
  });
});

describe("every constraint is honoured by an action that exists", () => {
  it("names only real actions in honouredBy", async () => {
    const { INSTALL_ACTION_NAMES, DETECT_ACTION_NAMES } = await import("../src/actions");
    const known = new Set<string>([...INSTALL_ACTION_NAMES, ...DETECT_ACTION_NAMES]);

    for (const constraint of Object.values(CONSTRAINTS)) {
      expect(constraint.honouredBy.length).toBeGreaterThan(0);
      for (const action of constraint.honouredBy) expect(known.has(action)).toBe(true);
    }
  });
});
