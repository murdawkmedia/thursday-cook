import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "esbuild";

/**
 * Resolves `.css` imports to a private namespace and loads them as a
 * default-exported string.
 *
 * Carried over from dotfiles-ai/build.mjs (the `cssTextPlugin` at the top of
 * the file). A client half cannot ship a separate stylesheet: the browser
 * module table hands the loader one JavaScript module, so styles have to
 * arrive as text the plugin injects itself. esbuild's built-in `text` loader
 * would work for a file esbuild owns, but the import specifier is relative to
 * the importer, so the resolve hook has to re-anchor it against
 * `args.resolveDir` before the load hook reads it.
 */
export const cssTextPlugin: Plugin = {
  name: "css-text",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path),
      namespace: "css-text",
    }));
    build.onLoad({ filter: /.*/, namespace: "css-text" }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
    });
  },
};
