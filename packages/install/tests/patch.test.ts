import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { loadBlockFile, parseBlock, type Block } from "../src/loader";
import {
  PatchError,
  generateWebPatch,
  planWebPatch,
  type PatchProblem,
} from "../src/patch";

// Where the fixture came from: dotfiles-ai/sync.sh step_write_web_patch,
// the 115-line heredoc this generator replaces. The heredoc interpolated
// $HERE (the dotfiles repo) and $DSH_HOME; the fixture keeps both as
// placeholders. Both resolve to the Thursday home in the block model, so
// the comparison substitutes one home for both.
const HOME = "/dsh-home";

const blockFile = (name: string) =>
  fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));
const exampleFile = (name: string) =>
  fileURLToPath(new URL(`../../blocks/${name}`, import.meta.url));

const SYNC_BLOCKS: string[] = [];
for (const name of [
  "host-plane",
  "tool-cordis",
  "compaction-instant",
  "better-mobile-ui",
  "llm-pi-ai",
  "remote",
]) {
  // The repo ships llm-pi-ai and compaction-instant; the rest are the new
  // example blocks this generator was built against.
  SYNC_BLOCKS.push(
    name === "compaction-instant" || name === "llm-pi-ai"
      ? blockFile(`${name}.md`)
      : exampleFile(`${name}.md`),
  );
}

/** The blocks, in the order sync.sh wrote the rows. */
function syncBlocks(): Block[] {
  return SYNC_BLOCKS.map((path) => loadBlockFile(path));
}

interface FlatRow {
  placement: "insert" | "override";
  entry: Record<string, unknown>;
}

/** Flatten a parsed patch document into rows, in written order. */
function flatten(text: string): FlatRow[] {
  const doc = parseYaml(text) as Array<Record<string, unknown>>;
  const rows: FlatRow[] = [];
  for (const item of doc) {
    if (item["insert"] !== undefined) {
      for (const entry of item["insert"] as Record<string, unknown>[]) {
        rows.push({ placement: "insert", entry });
      }
    } else {
      rows.push({ placement: "override", entry: item });
    }
  }
  return rows;
}

/** The problems a composition refuses for, whether thrown or returned. */
function problemsOf(blocks: Block[]): readonly PatchProblem[] {
  try {
    return [...planWebPatch(blocks, { dshHome: HOME }).problems];
  } catch (err) {
    if (err instanceof PatchError) return err.problems;
    throw err;
  }
}

/** The comment text as one string, so a wrapped phrase still matches. */
function commentsOf(yaml: string): string {
  return yaml.replace(/^[ \t]*#[ \t]?/gm, " ").replace(/\s+/g, " ");
}

/** A minimal valid block, used as the base for the negative cases. */
function makeBlock(frontmatter: string, body = "# t\n\nprose.\n"): Block {
  return parseBlock(`---\n${frontmatter}\n---\n\n${body}`, "<test>");
}

const OVERRIDE_REMOTE = `id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [remote]
    placement: override
    constraint: top-level-override
    why: dsh-remote owns the id; this supplies configuration only.
steps:
  - action: patch-row
    id: remote
    placement: override
    constraint: wholesale-override-config
    why: the override restates every default the base row supplies.
    config:
      enabled: true
      debug: true
      accounts: []
      secret: ""
      session:
        cookieName: dsh_session
        ttlSeconds: 604800
        secure: true
        sameSite: lax
      enforceRoles: true
      rateLimit:
        maxAttempts: 5
        windowMs: 900000
      files:
        roots:
          - /tmp/dsh
detect:
  - action: row-present
    id: remote
    placement: override`;

describe("the generated composition reproduces the sync.sh heredoc", () => {
  const generated = generateWebPatch(syncBlocks(), {
    dshHome: HOME,
    generator: "test reproduction of step_write_web_patch",
  });

  it("row by row, in order, in the right place", () => {
    const fixtureText = readFileSync(
      fileURLToPath(new URL("./fixtures/sync-sh-web-patch.yml", import.meta.url)),
      "utf8",
    )
      .replaceAll("%HERE%", HOME)
      .replaceAll("%DSH_HOME%", HOME);

    const fromFixture = flatten(fixtureText);
    const fromGenerator = flatten(generated.yaml);

    // Every insert row, in the heredoc's own order — insert order IS mount
    // order, so this must match exactly.
    expect(
      fromGenerator.filter((r) => r.placement === "insert").map((r) => r.entry["id"]),
    ).toEqual(fromFixture.filter((r) => r.placement === "insert").map((r) => r.entry["id"]));

    // The overrides: same three rows, same placements, all at top level.
    // The heredoc writes llm-pi-ai before command-compact; the generator
    // emits command-compact first because override rows travel with their
    // owning block and the insert order pins compaction-instant's block
    // earlier. The two overrides touch different ids and do not interact,
    // so either order boots; the set and placement are what the heredoc
    // actually requires.
    expect(fromGenerator.filter((r) => r.placement === "override").map((r) => r.entry["id"])).toEqual(
      expect.arrayContaining(
        fromFixture.filter((r) => r.placement === "override").map((r) => r.entry["id"]),
      ),
    );
    expect(fromGenerator.filter((r) => r.placement === "override")).toHaveLength(3);

    // Deep equality per row: same names, same config values, no extra keys.
    const byId = new Map(fromGenerator.map((r) => [r.entry["id"], r.entry]));
    for (const row of fromFixture) {
      expect(byId.get(row.entry["id"])).toEqual(row.entry);
    }

    // And the placement split the heredoc hard-codes: one insert group, then
    // three top-level override rows, in the heredoc's own order.
    expect(generated.insertIds).toEqual([
      "log-exporter",
      "bash-guard",
      "manifest-guard",
      "package-tool",
      "skill-gate",
      "see",
      "tmp-dsh-shared",
      "grant",
      "ask-interrupt",
      "profiles",
      "resume-command",
      "tool-cordis",
      "compaction-instant",
      "tool-recall",
      "ui-better-mobile",
      "llm-pi-ai-affinity",
    ]);
    expect([...generated.overrideIds].sort()).toEqual([
      "command-compact",
      "llm-pi-ai",
      "remote",
    ]);
  });

  it("keeps the three kill-boot rows OUT of the insert list", () => {
    expect(generated.insertIds).not.toContain("llm-pi-ai");
    expect(generated.insertIds).not.toContain("command-compact");
    expect(generated.insertIds).not.toContain("remote");
    // Rule 3: the insert group is the first document item and every override
    // follows it.
    const doc = parseYaml(generated.yaml) as Array<Record<string, unknown>>;
    expect(Array.isArray(doc[0]?.["insert"])).toBe(true);
    for (const item of doc.slice(1)) {
      expect(item["insert"]).toBeUndefined();
      expect(typeof item["id"]).toBe("string");
    }
  });

  it("resolves the heredoc's $HERE and $DSH_HOME interpolations", () => {
    // The plugin files are home-relative, as the heredoc's $HERE was; the
    // package rows are untouched. Compared on parsed values, since the
    // writer chooses its own quoting.
    const rows = flatten(generated.yaml);
    const entry = (id: string) => rows.find((r) => r.entry["id"] === id)?.entry;
    expect(entry("bash-guard")).toMatchObject({
      name: "/dsh-home/plugins/bash-guard.js",
      config: { guardsDir: "/dsh-home/plugins/guards" },
    });
    expect(entry("tool-cordis")).toEqual({
      id: "tool-cordis",
      name: "@deepseek-ai/dsh-tool-cordis",
    });
    expect(entry("bash-guard")).not.toMatchObject({ config: { guardsDir: "./plugins/guards" } });
  });

  it("round-trips: the text parses back to the rows it claims", () => {
    const doc = parseYaml(generated.yaml) as Array<Record<string, unknown>>;
    const inserts = doc[0]?.["insert"] as Record<string, unknown>[];
    expect(inserts).toHaveLength(generated.insertIds.length);
    expect(doc).toHaveLength(1 + generated.overrideIds.length);
  });
});

describe("rule 1: an owned id is never inserted", () => {
  it("refuses an insert of llm-pi-ai, command-compact or remote", () => {
    for (const id of ["llm-pi-ai", "command-compact", "remote"]) {
      const problems = problemsOf([
        makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [${id}]
    placement: insert
    why: A test block that gets it wrong.
steps:
  - action: patch-row
    id: ${id}
    name: some-package
detect:
  - action: row-present
    id: ${id}`),
      ]);
      expect(problems.some((p) => p.message.includes(`duplicate loader entry id: ${id}`))).toBe(
        true,
      );
      expect(problems.some((p) => p.message.includes("placement: override"))).toBe(true);
    }
  });

  it("refuses an insert even when the declaration agrees", () => {
    // The declaration is checked too, so the author is named at the field
    // they have to edit, not just at the step.
    const problems = problemsOf([
      makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [remote]
    placement: insert
    why: Wrong on purpose.
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`),
    ]);
    expect(problems.some((p) => p.message.includes("already mounts"))).toBe(true);
  });

  it("refuses two blocks inserting one id", () => {
    const one = (id: string) => `id: ${id}
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [${id}]
    placement: insert
    why: A row.
steps:
  - action: patch-row
    id: ${id}
    name: some-package
detect:
  - action: row-present
    id: ${id}`;
    const problems = problemsOf([makeBlock(one("alpha")), makeBlock(one("alpha"))]);
    expect(problems.some((p) => p.message.includes("both insert"))).toBe(true);
  });

  it("refuses a step and its own declaration disagreeing on placement", () => {
    const problems = problemsOf([
      makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [alpha]
    placement: insert
    why: A row.
steps:
  - action: patch-row
    id: alpha
    name: some-package
    placement: override
detect:
  - action: row-present
    id: alpha`),
    ]);
    expect(problems.some((p) => p.message.includes("declares it as"))).toBe(true);
  });
});

describe("rule 2: an override is assigned wholesale", () => {
  it("refuses an override that drops a default", () => {
    const dropped = makeBlock(OVERRIDE_REMOTE.replace(
      /      secret: ""\n/,
      "",
    ).replace("      enforceRoles: true\n", ""));
    const problems = problemsOf([dropped]);
    const message = problems.map((p) => p.message).join("\n");
    expect(message).toContain("`config.secret`");
    expect(message).toContain("`config.enforceRoles`");
    expect(message).toContain("WHOLESALE");
  });

  it("refuses an override that drops a nested default", () => {
    const dropped = makeBlock(
      OVERRIDE_REMOTE.replace("        windowMs: 900000\n", ""),
    );
    const problems = problemsOf([dropped]);
    expect(problems.map((p) => p.message).join("\n")).toContain(
      "`config.rateLimit.windowMs`",
    );
  });

  it("accepts the complete remote override and records what actually differs", () => {
    const block = makeBlock(OVERRIDE_REMOTE);
    const result = generateWebPatch([block], { dshHome: HOME });
    const paths = result.differences["remote"]?.map((d) => d.path);
    // debug and files are additions (the plugin's patch has neither);
    // session.secure is the one changed default.
    expect(paths).toEqual(["config.debug", "config.session.secure", "config.files.roots"]);
    expect(result.warnings).toEqual([]);
  });

  it("warns, but does not refuse, an override of an id nothing owns", () => {
    const block = makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [ghost]
    placement: override
    why: A row nothing mounts.
steps:
  - action: patch-row
    id: ghost
    placement: override
    constraint: wholesale-override-config
    why: the override restates every default the base row supplies.
    config:
      a: 1
detect:
  - action: row-present
    id: ghost
    placement: override`);
    const result = generateWebPatch([block], { dshHome: HOME });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain("entry ghost not found");
  });
});

describe("rule 3: insert rows come first, overrides after", () => {
  it("writes the insert group before any override even when declared the other way", () => {
    const block = makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [alpha]
    placement: insert
    why: A new row.
  - file: profiles/web/cordis.patch.yml
    rows: [remote]
    placement: override
    constraint: top-level-override
    why: An override.
steps:
  - action: patch-row
    id: remote
    placement: override
    constraint: wholesale-override-config
    why: the override restates every default the base row supplies.
    config:
      enabled: true
      debug: true
      accounts: []
      secret: ""
      session:
        cookieName: dsh_session
        ttlSeconds: 604800
        secure: true
        sameSite: lax
      enforceRoles: true
      rateLimit:
        maxAttempts: 5
        windowMs: 900000
      files:
        roots:
          - /tmp/dsh
  - action: patch-row
    id: alpha
    name: some-package
detect:
  - action: row-present
    id: alpha`);
    // The override step comes FIRST in the block; the generated file still
    // puts the insert group first, because applyEntryPatches indexes rows as
    // it inserts them.
    expect(block.frontmatter.steps[0]?.action).toBe("patch-row");
    const result = generateWebPatch([block], { dshHome: HOME });
    expect(generatedInsertsFirst(result.yaml)).toBe(true);
  });

  function generatedInsertsFirst(yaml: string): boolean {
    const doc = parseYaml(yaml) as Array<Record<string, unknown>>;
    return Array.isArray(doc[0]?.["insert"]);
  }
});

describe("declarations are the record: every claim is backed", () => {
  it("refuses an undeclared row", () => {
    const problems = problemsOf([
      makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig: []
steps:
  - action: patch-row
    id: alpha
    name: some-package
detect:
  - action: row-present
    id: alpha`),
    ]);
    expect(problems.some((p) => p.message.includes("no `dshConfig` entry"))).toBe(true);
  });

  it("refuses a declared row nothing writes", () => {
    const problems = problemsOf([
      makeBlock(`id: t
version: 1
rationale: A test block.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [alpha]
    placement: insert
    why: A claim nothing backs.
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`),
    ]);
    expect(problems.some((p) => p.message.includes("no step writes it"))).toBe(true);
  });

  it("refuses a dependency cycle, because there is no row order without one", () => {
    const a = makeBlock(`id: a
version: 1
rationale: A test block.
dependsOn: [b]
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`);
    const b = makeBlock(`id: b
version: 1
rationale: A test block.
dependsOn: [a]
steps:
  - action: copy-tree
    from: a
    to: b
detect:
  - action: path-exists
    path: b`);
    expect(() => planWebPatch([a, b], { dshHome: HOME })).toThrow(/forms a cycle/);
  });
});

describe("the heredoc's comments now live in the generated file", () => {
  const yaml = generateWebPatch(syncBlocks(), { dshHome: HOME }).yaml;
  const comments = commentsOf(yaml);

  it("says the patch is generated and not to be hand-edited", () => {
    expect(comments).toContain("Auto-generated by");
    expect(comments).toContain("from 6 install blocks");
    expect(comments).toContain("Do not hand-edit");
  });

  it("carries the host-plane preamble on the rows it describes", () => {
    expect(comments).toContain("apply to EVERY session regardless of preset");
    expect(comments).toContain("guards directory");
  });

  it("carries the duplicate-id rule where the heredoc carried it as a comment", () => {
    // sync.sh, on command-compact: "a second one kills boot with
    // 'duplicate loader entry id: command-compact'". That is now data:
    // the placement enum plus this comment.
    expect(comments).toContain("duplicate loader entry id: command-compact");
    expect(comments).toContain("duplicate loader entry id: remote");
    expect(comments).toContain("duplicate loader entry id: llm-pi-ai");
  });

  it("carries the wholesale-assignment rule as a derived difference list", () => {
    // sync.sh: "It does not deep-merge, so the block below must repeat every
    // default". The generator now derives the values that differ and prints
    // them, rather than trusting a comment to stay true.
    expect(comments).toContain("Assigned wholesale over @xgone/dsh-remote's row");
    expect(comments).toContain("config.session.secure = true (was false)");
    expect(comments).toContain('config.debug = true (added)');
    expect(comments).toContain('config.files.roots = ["/tmp/dsh"] (added)');
  });

  it("keeps the MCP-server and alwaysDeny reasoning beside their rows", () => {
    expect(comments).toContain("two registrars for one server name");
    expect(comments).toContain("alwaysDeny hides them from every agent");
  });
});

describe("adding a plugin is a block change, not a YAML edit", () => {
  it("the fifth demo block adds its rows with no hand-written YAML", () => {
    const withJobViewer = [...syncBlocks(), loadBlockFile(exampleFile("job-viewer.md"))];
    const result = generateWebPatch(withJobViewer, { dshHome: HOME });

    // One new insert, mounted under its own id, after the existing rows.
    expect(result.insertIds).toContain("job-viewer");
    expect(result.insertIds.at(-1)).toBe("job-viewer");

    // One new top-level override switching the builtin panel off.
    expect(result.overrideIds).toContain("ui-jobs");
    const doc = parseYaml(result.yaml) as Array<Record<string, unknown>>;
    const overrides = doc.slice(1) as Record<string, unknown>[];
    expect(overrides.at(-1)).toEqual({ id: "ui-jobs", disabled: true });

    // And the reason travelled with it, into the file, from the block.
    const comments = commentsOf(result.yaml);
    expect(comments).toContain("two dropdowns reading different mirrors");
    expect(comments).toContain("duplicate loader entry id: ui-jobs");
  });

  it("and the previous blocks' rows are untouched by it", () => {
    const before = generateWebPatch(syncBlocks(), { dshHome: HOME });
    const after = generateWebPatch(
      [...syncBlocks(), loadBlockFile(exampleFile("job-viewer.md"))],
      { dshHome: HOME },
    );
    expect(after.insertIds.slice(0, -1)).toEqual(before.insertIds);
    expect(after.overrideIds.filter((id) => id !== "ui-jobs")).toEqual(before.overrideIds);
  });
});
