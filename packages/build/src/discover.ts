import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BuildSpec } from "./spec.js";

/** File a package drops in its own directory to declare its build. */
export const BUILD_CONFIG_FILENAMES: readonly string[] = ["build.config.mjs", "build.config.js"];

/** Workspace globs, kept in step with pnpm-workspace.yaml. */
export const DEFAULT_PACKAGE_DIRS: readonly string[] = ["packages", "packages/plugins"];

async function subdirectories(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
    .map((e) => join(dir, e.name))
    .sort();
}

async function configIn(dir: string): Promise<string | undefined> {
  const names = new Set(await readdir(dir).catch(() => [] as string[]));
  return BUILD_CONFIG_FILENAMES.map((n) => (names.has(n) ? join(dir, n) : undefined)).find(Boolean);
}

/**
 * Walk the workspace and collect every package's own build declaration.
 *
 * This is what replaces the ~25-entry array in dotfiles-ai/build.mjs. A
 * package owns its build by exporting a {@link BuildSpec} as the default
 * export of `build.config.mjs`; nothing central has to be edited to add one.
 * A config may also default-export an array of specs.
 */
export async function discoverBuildSpecs(
  workspaceRoot: string,
  packageDirs: readonly string[] = DEFAULT_PACKAGE_DIRS,
): Promise<BuildSpec[]> {
  const specs: BuildSpec[] = [];
  for (const rel of packageDirs) {
    for (const pkgDir of await subdirectories(resolve(workspaceRoot, rel))) {
      const configPath = await configIn(pkgDir);
      if (!configPath) continue;
      const mod: unknown = await import(pathToFileURL(configPath).href);
      const value = (mod as { default?: unknown }).default;
      const found = Array.isArray(value) ? value : value ? [value] : [];
      for (const spec of found) {
        specs.push(spec as BuildSpec);
      }
    }
  }
  return specs.sort((a, b) => a.name.localeCompare(b.name));
}
