import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

/**
 * One loader row that something upstream of the profile already mounts.
 *
 * This is the registry the composition generator checks a block against, and
 * it is the machine-readable half of the constraint `top-level-override`. The
 * constraint registry says *what* the rule is; this says *which ids* it binds,
 * *who* owns each one, and *what the owner's row already says* — the three
 * facts a generator needs to refuse a bad patch instead of writing one.
 *
 * Two different failures live here:
 *
 * 1. Inserting an owned id kills boot. `cordis-plugin-loader` rejects a group
 *    whose entries repeat an id with `duplicate loader entry id: <id>`, so a
 *    second row is not a merge and not a warning — the profile does not start.
 * 2. Overriding an owned id assigns WHOLESALE. `applyEntryPatches` ends with
 *    `for (const [key, value] of Object.entries(overrides)) target[key] = value`
 *    (`@deepseek-ai/dsh-app-boot/lib/index.js`), so an override that supplies
 *    `config:` replaces the owner's entire `config:` — every default it does
 *    not restate is gone. `defaults` is what the owner actually writes, so the
 *    generator can name the keys an override dropped.
 */
export interface UpstreamRow {
  /** The loader entry id, as it appears in the owner's patch. */
  readonly id: string;
  /** The package whose bundle patch mounts it. */
  readonly owner: string;
  /**
   * The owner's row, minus `id` and `name`: the keys an override replaces.
   *
   * Only object-valued keys matter for the wholesale check — replacing a
   * scalar loses nothing, replacing a map loses every key not restated.
   */
  readonly defaults: Readonly<Record<string, unknown>>;
  /** Where this was read from, so the snapshot can be re-checked by hand. */
  readonly origin: string;
  /** What the owner's row is for, and anything a later reader must know. */
  readonly note: string;
}

/**
 * Every upstream-owned id Thursday knows about, keyed by id.
 *
 * A snapshot, not a guess: each entry was read out of the named file at the
 * named version. `readBundleDefaults` re-derives the same shape from a patch
 * file on disk, and `generateWebPatch` takes a merged table through its
 * `upstreamRows` option — so an installer that has the real `node_modules`
 * available should read the live files and never depend on this snapshot.
 */
export const UPSTREAM_ROWS = {
  "llm-pi-ai": {
    id: "llm-pi-ai",
    owner: "@deepseek-ai/dsh-base",
    defaults: {},
    origin: "@deepseek-ai/dsh-base@0.1.0-rc.8/cordis.patch.yml:95 (insert list)",
    note: "The pi-ai adapter, mounted dormant. The vendored fork registers the same adapter, so exactly one of the two rows may be enabled: the fork mounts under its own id and this one is disabled by a top-level override.",
  },
  "command-compact": {
    id: "command-compact",
    owner: "@deepseek-ai/dsh-base",
    defaults: {},
    origin: "@deepseek-ai/dsh-base@0.1.0-rc.8/cordis.patch.yml:289 (insert list)",
    note: "The human `/compact` command. dsh-base mounts it on the host plane and @deepseek-ai/dsh-web-app disables it again (cordis.patch.yml:382), so re-enabling it is an override of an id two upstream layers already touched — never a new row.",
  },
  "compaction-basic": {
    id: "compaction-basic",
    owner: "@deepseek-ai/dsh-base",
    defaults: {},
    origin: "@deepseek-ai/dsh-base@0.1.0-rc.8/cordis.patch.yml:284 (insert list)",
    note: "The builtin compaction engine. A block replacing it mounts its own row under a NEW id and names the aliased package; inserting `compaction-basic` a second time kills boot.",
  },
  "tool-jobs": {
    id: "tool-jobs",
    owner: "@deepseek-ai/dsh-base",
    defaults: {},
    origin: "@deepseek-ai/dsh-base@0.1.0-rc.8/cordis.patch.yml:218 (insert list)",
    note: "The builtin background-jobs tool, disabled again by @deepseek-ai/dsh-web-app (cordis.patch.yml:331). A replacement mounts under its own id.",
  },
  "spill-local": {
    id: "spill-local",
    owner: "@deepseek-ai/dsh-web-app",
    defaults: {},
    origin:
      "sync.sh step_write_web_patch (top-level override; the id carries a name: key set by the override itself)",
    note: "Points dsh-web-app's spill root at /tmp/thursday/spill. An override of a row the bundle does not declare as an insert, so it is recorded here so the generator's ownership check accepts it.",
  },
  "ui-jobs": {
    id: "ui-jobs",
    owner: "@deepseek-ai/dsh-web-app",
    defaults: {},
    origin: "@deepseek-ai/dsh-web-app@0.1.0-rc.8/cordis.patch.yml:258 (insert list)",
    note: "The builtin jobs panel. sync.sh switched it off by EDITING this file inside the package tree; a profile-layer override row does the same thing without touching the dsh install, because the profile layer composes after every bundle layer.",
  },
  remote: {
    id: "remote",
    owner: "@xgone/dsh-remote",
    // Read out of the plugin's own bundle patch. `debug` and `files` are NOT
    // here: the profile patch adds them, which is why the generator reports
    // them as additions rather than as differences from a default.
    defaults: {
      config: {
        enabled: true,
        accounts: [],
        secret: "",
        session: {
          cookieName: "dsh_session",
          ttlSeconds: 604800,
          secure: false,
          sameSite: "lax",
        },
        enforceRoles: true,
        rateLimit: {
          maxAttempts: 5,
          windowMs: 900000,
        },
      },
    },
    origin: "@xgone/dsh-remote@0.2.5/cordis.patch.yml:18-40 (insert list)",
    note: "The plugin mounts its own row from its own bundle patch, so the profile supplies configuration only. This is the row the wholesale-assignment rule was learned on: the override must repeat all seven of these keys to change two of them.",
  },
  "directory-picker-browse": {
    id: "directory-picker-browse",
    owner: "@xgone/dsh-remote",
    defaults: { config: { maxEntries: 1000 } },
    origin: "@xgone/dsh-remote@0.2.5/cordis.patch.yml:67 (insert list)",
    note: "Mounted by the remote plugin as part of its directory-picker swap.",
  },
  "directory-picker-browse-ui": {
    id: "directory-picker-browse-ui",
    owner: "@xgone/dsh-remote",
    defaults: {},
    origin: "@xgone/dsh-remote@0.2.5/cordis.patch.yml:72 (insert list)",
    note: "Browser half of the remote plugin's directory-picker swap.",
  },
} as const satisfies Record<string, UpstreamRow>;

/** The id of a row Thursday knows something upstream already mounts. */
export type UpstreamRowId = keyof typeof UPSTREAM_ROWS;

/** Every known upstream-owned id, for messages and for tests. */
export const UPSTREAM_ROW_IDS = Object.keys(UPSTREAM_ROWS) as UpstreamRowId[];

/** A table of upstream-owned rows, keyed by id. */
export type UpstreamRowTable = Readonly<Record<string, UpstreamRow>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the rows a bundle patch file mounts, as an upstream-owned row table.
 *
 * Only `insert:` rows count as ownership: a top-level row in someone else's
 * patch is that bundle overriding a row it does not own, which says nothing
 * about who owns the id. Groups are walked, because an insert can target a
 * group by id and its children are entries too.
 *
 * This is what an installer should call — the defaults then come from the
 * package actually on disk rather than from the snapshot above, so a plugin
 * that adds a config default between versions cannot silently invalidate an
 * override that was complete when it was written.
 */
export function readBundleDefaults(patchFile: string, owner = patchFile): UpstreamRowTable {
  const text = readFileSync(patchFile, "utf8");
  const parsed: unknown = parseYaml(text);
  const table: Record<string, UpstreamRow> = {};
  if (!Array.isArray(parsed)) return table;

  const take = (rows: unknown, at: string): void => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const id = row["id"];
      if (typeof id !== "string" || id.length === 0) continue;
      const { id: _id, name: _name, ...defaults } = row;
      table[id] = {
        id,
        owner,
        defaults,
        origin: `${patchFile} (${at})`,
        note: `Mounted by ${owner}.`,
      };
      // A group's children are entries in the same id space.
      if (row["group"] === true) take(row["config"], `${at} > group ${id}`);
    }
  };

  for (const item of parsed) {
    if (!isPlainObject(item)) continue;
    if (item["insert"] !== undefined) take(item["insert"], "insert list");
  }
  return table;
}
