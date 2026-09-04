/**
 * The static site generator: a page table, a render call, a file write.
 *
 * It is a plain function taking explicit paths rather than a script that
 * guesses them from `import.meta.url`, because it is bundled to a throwaway
 * file before it runs and must not care where that file landed.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { designPage } from "./pages/design";
import { indexPage } from "./pages/index";

export interface Page {
  /** Emitted path relative to the output root. */
  readonly file: string;
  /** The URL that path serves at, for the summary line. */
  readonly url: string;
  readonly render: () => string;
}

/**
 * Directory-style URLs (`/design/` rather than `/design.html`) so the site can
 * be served by any static host without rewrite rules and the paths stay stable
 * if a page later grows children.
 */
export const PAGES: readonly Page[] = [
  { file: "index.html", url: "/", render: indexPage },
  { file: join("design", "index.html"), url: "/design/", render: designPage },
];

export interface BuildOptions {
  /** Absolute path of the output directory. Its contents are replaced. */
  readonly outDir: string;
  /** Absolute path of the repository's canonical logo asset. */
  readonly logoSource: string;
}

export interface BuildResult {
  readonly written: string[];
}

export function buildSite(options: BuildOptions): BuildResult {
  const written: string[] = [];

  for (const page of PAGES) {
    const target = join(options.outDir, page.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, page.render(), "utf8");
    written.push(page.file);
  }

  // The mark is copied, never duplicated: `assets/thursday-logo.svg` at the
  // repository root stays the single source for it.
  const assetsDir = join(options.outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(options.logoSource, join(assetsDir, "thursday-logo.svg"));
  written.push(join("assets", "thursday-logo.svg"));

  return { written };
}

/** Remove a previous build. Exported so the driver script owns the ordering. */
export function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
