/**
 * CLASSIFY a session log: whose it is (human or subagent), where it sits in its
 * delegation tree (parent, depth), what state it is in (live / archived /
 * superseded) and what it is called.
 *
 * THIS MODULE IS THE CLASSIFIER — the only one. #231's CLI listing and #233's
 * import selection list both consume it. A second implementation of "is this
 * archived / whose session is this / what is it called" anywhere in the tree is
 * a bug: two definitions of the same fact drift, and after they do, the browser
 * and the CLI disagree about what is safe to delete.
 *
 * Archived-ness has exactly one source of truth: the workspace registry's
 * `archivedSessionIds` getter, which the caller passes in as `archivedIds`.
 * Nothing here reads a marker file, a sidecar index or a directory convention
 * (#231's refusal, preserved). A caller with no registry passes nothing and
 * every session classifies as live or superseded on its own structural facts.
 *
 * Pure functions over plain values. The caller reads; nothing here opens a file.
 */
import path from "node:path";

/**
 * dsh records a parent as `session-<uuid>` while directory names drift between
 * `session-<uuid>` and bare `<uuid>`. Every tree link in this module goes
 * through this normalisation so both observed shapes interconnect.
 *
 * @param {string} name a session id, a parentSession value, or a directory name
 * @returns {string} the bare session id
 */
export function normalizeSessionId(name) {
  if (typeof name !== "string") return "";
  return name.startsWith("session-") ? name.slice("session-".length) : name;
}

/**
 * `.superseded-<iso>` siblings are what `repair` leaves behind. They are not
 * archived, not live, and never importable as if they were sessions.
 *
 * @param {string} name a file or directory name
 * @returns {string|null} the superseded suffix when the name carries one
 */
export function supersededSuffix(name) {
  const i = typeof name === "string" ? name.indexOf(".superseded-") : -1;
  return i >= 0 ? name.slice(i) : null;
}

/**
 * The three classes that exist on disk (#231). One session, one class.
 *
 * @param {{file?: string, sessionId?: string, name?: string}} entry
 * @param {Set<string>|string[]} [archivedIds] the registry's archivedSessionIds
 * @returns {"live"|"archived"|"superseded"}
 */
export function classifyState(entry, archivedIds) {
  const name = entry.name ?? path.basename(entry.file ?? entry.sessionId ?? "");
  if (supersededSuffix(name) || supersededSuffix(path.basename(entry.file ?? ""))) return "superseded";
  const id = normalizeSessionId(entry.sessionId ?? name);
  const archived = archivedIds instanceof Set ? archivedIds : new Set(archivedIds ?? []);
  return archived.has(id) || archived.has(entry.sessionId ?? "") ? "archived" : "live";
}

/**
 * The other axis: a HUMAN session (the person talking) or a SUBAGENT session
 * (dispatched under one). Explicit in every log's header record — `origin`,
 * `delegationDepth`, `parentSession` — so this needs no heuristic.
 *
 * @param {object|null} header the log's first record (`type: "session"`)
 * @returns {{origin: "human"|"subagent", delegationDepth: number, parent: string|null,
 *            sessionId: string|null, createdAt: number|null, cwd: string|null, agentPreset: string|null}}
 */
export function classifyHeader(header) {
  const h = header ?? {};
  const rawParent = typeof h.parentSession === "string" && h.parentSession.length > 0 ? h.parentSession : null;
  return {
    origin: h.origin === "subagent" ? "subagent" : "human",
    delegationDepth: Number.isInteger(h.delegationDepth) ? h.delegationDepth : 0,
    parent: rawParent ? normalizeSessionId(rawParent) : null,
    sessionId: typeof h.id === "string" ? normalizeSessionId(h.id) : null,
    createdAt: Number.isFinite(h.createdAt) ? h.createdAt : null,
    cwd: typeof h.cwd === "string" ? h.cwd : null,
    agentPreset: typeof h.agentPreset === "string" ? h.agentPreset : null,
  };
}

/**
 * Resolve a session's title from its decoded record lines.
 *
 * Last `session/title` wins: a retitled log keeps the name the user settled on.
 * A log with no title event returns `null`, and the caller shows an explicit
 * "(untitled)" rather than an empty column (#231's rule).
 *
 * @param {Iterable<string>} lines decoded JSONL record lines (header included)
 * @returns {string|null}
 */
export function resolveTitle(lines) {
  let title = null;
  for (const line of lines) {
    if (!line.includes("session/title")) continue;
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (v?.type !== "session/title") continue;
    const t = v?.data?.title;
    if (typeof t === "string") title = t;
  }
  return title;
}

/**
 * Make a title safe for a terminal: strip ANSI escapes and control characters.
 * The raw title is still available to `--json` callers; this is rendering only.
 *
 * @param {string|null} title
 * @returns {string}
 */
export function sanitizeTitle(title) {
  if (typeof title !== "string") return "(untitled)";
  const clean = title
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.trim().length > 0 ? clean.trim() : "(untitled)";
}

/**
 * Group sessions into delegation TREES. The tree is the unit of work: a human
 * session and the subagent sessions dispatched under it are one piece of work
 * (#233). Links are by normalised id, so `session-<uuid>` parents and bare
 * `<uuid>` directories interconnect.
 *
 * A session whose parent is absent from the corpus still gets its own tree,
 * flagged `parentMissing` — visible, never silently re-parented.
 *
 * @param {Array<{sessionId: string, parent?: string|null}>} entries
 * @returns {Array<{treeId: string, roots: string[], members: string[], parentMissing: string[]}>}
 *   treeId is the normalised id of the tree's topmost member; members are
 *   normalised ids, roots first.
 */
export function buildSessionTrees(entries) {
  const byId = new Map();
  for (const e of entries) {
    const id = normalizeSessionId(e.sessionId);
    if (id && !byId.has(id)) byId.set(id, { ...e, id, parent: e.parent ? normalizeSessionId(e.parent) : null });
  }
  const children = new Map();
  for (const e of byId.values()) {
    if (e.parent && byId.has(e.parent)) {
      if (!children.has(e.parent)) children.set(e.parent, []);
      children.get(e.parent).push(e.id);
    }
  }
  const parentMissing = [];
  for (const e of byId.values()) {
    if (e.parent && !byId.has(e.parent)) parentMissing.push(e.id);
  }
  const roots = [...byId.keys()].filter((id) => {
    const e = byId.get(id);
    return !(e.parent && byId.has(e.parent));
  });
  const trees = [];
  for (const rootId of roots) {
    const members = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift();
      members.push(id);
      for (const c of children.get(id) ?? []) queue.push(c);
    }
    trees.push({
      treeId: rootId,
      roots: [rootId],
      members,
      parentMissing: members.filter((m) => parentMissing.includes(m)),
    });
  }
  return trees;
}

/**
 * The connected tree one entry belongs to: walk up to the tree root via parent
 * links, then collect every descendant. Importing a parent alone or a child
 * alone both land the whole tree — that is what "no orphan is created" means
 * (#233).
 *
 * @param {string} sessionId
 * @param {Array} entries the same shape buildSessionTrees takes
 * @returns {{treeId: string, roots: string[], members: string[], parentMissing: string[]}|null}
 */
export function treeOf(sessionId, entries) {
  const id = normalizeSessionId(sessionId);
  return buildSessionTrees(entries).find((t) => t.members.includes(id)) ?? null;
}

/**
 * Is this directory name a session directory, and of which shape? Both
 * observed shapes are real: `session-<uuid>` and bare `<uuid>`.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSessionDirName(name) {
  if (supersededSuffix(name)) return false;
  const id = normalizeSessionId(name);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
