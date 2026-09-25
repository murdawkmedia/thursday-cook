/**
 * Write the web profile composition: `profiles/web/package.json`'s bundle list
 * and `profiles/web/cordis.patch.yml`.
 *
 * WHY THIS EXISTS. Until this module, the `patch-row`, `disable-row` and
 * `enable-row` actions printed "Would patch row: …" and reported success
 * without writing anything, and `generateWebPatch` — complete and tested — was
 * never called by the installer. Found on 2026-09-24 rehearsing the cutover:
 * a fresh install reported 71 steps and no problems, then `dsh web` sat idle
 * forever because the profile it composed was empty. Two separate holes:
 *
 *   1. No patch file, so none of Thursday's rows were mounted.
 *   2. pnpm-add had created `profiles/web/package.json` holding only
 *      `dependencies`. dsh reads `dsh.profile.bundles` from that same file,
 *      and without `@deepseek-ai/dsh-web-app` nothing provides the web server,
 *      so dsh boots, watches its config, and never listens. No error.
 *
 * A row whose local module file does not exist is LEFT OUT and reported as a
 * problem by name, never silently dropped: a missing file kills the boot, and
 * a composition that half-boots with a named gap is usable where one that does
 * not boot is not. The host-plane rows are the known case — their block says
 * so ("a forward declaration") until the host-plugin migration lands.
 */
import { join } from "node:path";
import * as nodeFs from "node:fs";
import { parseDocument, isMap, isSeq } from "yaml";

import type { Block } from "./loader";
import { generateWebPatch, orderBlocks } from "./patch";
import { readBundleDefaults, type UpstreamRowTable } from "./upstream";
import type { FilesystemAPI } from "./install";

/** The bundles dsh's own default web profile declares. */
export const WEB_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] as const;

const PATCH_FILE = "profiles/web/cordis.patch.yml";

export interface ComposeResult {
  changed: boolean;
  output: string[];
  /** Rows left out because their module file is missing. */
  omitted: { id: string; name: string; block: string }[];
}

/**
 * Find a bundle's own `cordis.patch.yml` in the runtime's pnpm store, so the
 * generator's wholesale-override check compares against the version actually
 * installed rather than the recorded snapshot.
 */
function findBundlePatch(thursdayHome: string, pkg: string): string | undefined {
  const bare = pkg.replace("@deepseek-ai/", "");
  const pnpmDir = join(thursdayHome, "runtime", "node_modules", ".pnpm");
  let entries: string[];
  try {
    entries = nodeFs.readdirSync(pnpmDir);
  } catch {
    return undefined;
  }
  const hits = entries
    .filter((e) => e.startsWith(`@deepseek-ai+${bare}@`))
    .map((e) => join(pnpmDir, e, "node_modules", "@deepseek-ai", bare, "cordis.patch.yml"))
    .filter((p) => nodeFs.existsSync(p))
    .sort();
  return hits[hits.length - 1];
}

function upstreamRows(thursdayHome: string): UpstreamRowTable | undefined {
  const table: Record<string, UpstreamRowTable[string]> = {};
  let found = 0;
  for (const pkg of WEB_BUNDLES) {
    const file = findBundlePatch(thursdayHome, pkg);
    if (file === undefined) continue;
    Object.assign(table, readBundleDefaults(file, pkg));
    found++;
  }
  // Neither found: let the generator fall back to its recorded snapshot.
  return found > 0 ? table : undefined;
}

/** Ensure `package.json` declares dsh's bundles, keeping every other key. */
function ensureBundles(profileDir: string, fs: FilesystemAPI, out: string[]): boolean {
  const file = join(profileDir, "package.json");
  let pkg: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    pkg = JSON.parse(fs.readFileSync(file, "utf8") as string) as Record<string, unknown>;
  }
  const dsh = (pkg["dsh"] ?? {}) as Record<string, unknown>;
  const profile = (dsh["profile"] ?? {}) as Record<string, unknown>;
  const current = Array.isArray(profile["bundles"]) ? (profile["bundles"] as string[]) : [];
  const missing = WEB_BUNDLES.filter((b) => !current.includes(b));
  if (missing.length === 0 && profile["patchReload"] !== undefined) return false;

  profile["bundles"] = [...current, ...missing];
  if (profile["patchReload"] === undefined) profile["patchReload"] = "live";
  dsh["profile"] = profile;
  pkg["dsh"] = dsh;
  if (pkg["name"] === undefined) pkg["name"] = "dsh-profile-web";
  if (pkg["private"] === undefined) pkg["private"] = true;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  out.push(`Declared bundles in profiles/web/package.json: ${missing.join(", ") || "(patchReload only)"}`);
  return true;
}

/**
 * A row name that is an absolute path is a local module file; anything else is
 * a package name and is the package manager's problem, not ours.
 */
function localModuleMissing(name: unknown): name is string {
  return typeof name === "string" && name.startsWith("/") && !nodeFs.existsSync(name);
}

export function composeWebProfile(
  blocks: readonly Block[],
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): ComposeResult {
  const out: string[] = [];
  const omitted: ComposeResult["omitted"] = [];
  const profileDir = join(dshPath, "profiles", "web");
  fs.mkdirSync(profileDir, { recursive: true });

  let changed = ensureBundles(profileDir, fs, out);

  const rootFile = join(profileDir, "cordis.yml");
  if (!fs.existsSync(rootFile)) {
    fs.writeFileSync(
      rootFile,
      "# dsh profile root — an empty entry list. The tree is composed as patches:\n" +
        "# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml.\n" +
        "# Thursday generates cordis.patch.yml; edit the blocks, not these files.\n[]\n",
    );
    changed = true;
  }

  const patch = generateWebPatch(orderBlocks(blocks), {
    dshHome: dshPath,
    file: PATCH_FILE,
    upstreamRows: upstreamRows(thursdayHome),
  });

  // Drop insert rows whose local module file is missing, keeping comments.
  const doc = parseDocument(patch.yaml);
  const top = doc.contents;
  if (isSeq(top) && top.items.length > 0 && isMap(top.items[0])) {
    const seq = top.items[0].get("insert", true);
    if (isSeq(seq)) {
      seq.items = seq.items.filter((item) => {
        if (!isMap(item)) return true;
        const name = item.get("name");
        if (!localModuleMissing(name)) return true;
        const id = String(item.get("id"));
        const row = patch.rows.find((r) => r.id === id);
        omitted.push({ id, name, block: row?.block ?? "?" });
        return false;
      });
    }
  }
  const yaml = doc.toString({ lineWidth: 0 });

  const target = join(dshPath, PATCH_FILE);
  const before = fs.existsSync(target) ? (fs.readFileSync(target, "utf8") as string) : undefined;
  if (before !== yaml) {
    fs.writeFileSync(target, yaml);
    changed = true;
  }
  const mounted = patch.insertIds.length - omitted.length;
  out.push(
    `Wrote ${PATCH_FILE}: ${mounted} row(s) inserted, ${patch.overrideIds.length} override(s)` +
      (omitted.length > 0 ? `, ${omitted.length} left out (module file missing)` : ""),
  );
  for (const w of patch.warnings) out.push(`warning: ${typeof w === "string" ? w : JSON.stringify(w)}`);
  return { changed, output: out, omitted };
}
