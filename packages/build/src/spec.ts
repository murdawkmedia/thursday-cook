import type { BuildOptions, LogLevel } from "esbuild";

/**
 * The two halves of a dsh plugin bundle differently enough that they are
 * separate shapes rather than one option bag with a `platform` field.
 *
 * HOST half: platform node, format esm, `@deepseek-ai/*` and `node:*`
 * external. The dsh packages are resolved by the loader from the host base
 * (the profile's node_modules) at runtime, so bundling them would both bloat
 * the output and give the plugin a second, non-identical copy of the runtime
 * it is supposed to be extending.
 *
 * CLIENT half: platform browser, format cjs, target es2022, react and
 * `@deepseek-ai/*` external, JSX transformed to the lowercase `react` global,
 * then wrapped so the browser module loader accepts it.
 */

/** Externals every host half shares. */
export const HOST_EXTERNAL: readonly string[] = ["@deepseek-ai/*", "node:*"];

/**
 * Externals every client half shares.
 *
 * Bare `react-dom` is external too, not only `react-dom/client`. From
 * dotfiles-ai/build.mjs: the module loader supplies it, and four shipped
 * bundles already require it that way (dsh-client-ui-trajectory, -renderer,
 * -message-feedback, -attachment). Without the bare specifier here, any
 * dependency that portals pulls a second copy of react-dom into the bundle —
 * about 130 KB.
 */
export const CLIENT_EXTERNAL: readonly string[] = [
  "react",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/*",
];

/**
 * The banner that restores a real `require` in ESM output.
 *
 * Load-bearing, and the reason it exists is not obvious from the code. A
 * bundled dependency may call `require("child_process")` or
 * `require("process")` with a BARE specifier — cross-spawn (pulled in by
 * @modelcontextprotocol/sdk's stdio transport) does the first, the `yaml`
 * package's composer does the second. The `node:*` external pattern does not
 * match a bare specifier, so esbuild inlines its own `__require` shim for the
 * call, and that shim throws in ESM output because no `require` binding
 * exists. The shim checks `typeof require !== "undefined"` before it throws,
 * so restoring a real `require` through `createRequire` satisfies it.
 *
 * Without this the whole plugin tree fails to load and dsh does not boot —
 * one unbannered host half takes down every plugin, not just its own.
 */
export const CREATE_REQUIRE_BANNER: string = [
  'import { createRequire as __dshCreateRequire } from "node:module";',
  "const require = __dshCreateRequire(import.meta.url);",
].join("\n");

/** Escape hatch: raw esbuild options merged last, over everything computed. */
export type EsbuildOverrides = Omit<BuildOptions, "entryPoints" | "outfile">;

export interface HostBuild {
  /** Entry point, resolved against the spec's `root`. */
  entry: string;
  /** Output file, resolved against the spec's `root`. */
  outfile: string;
  /**
   * Extra externals, MERGED with {@link HOST_EXTERNAL} rather than replacing
   * it. dotfiles-ai's subscriptions host half is the live example: it adds
   * `lz4`, a native .node addon esbuild cannot bundle, and still needs the
   * two defaults.
   */
  external?: string[];
  /**
   * Inject {@link CREATE_REQUIRE_BANNER}. Set this on any host half that
   * bundles a dependency calling `require()` with a bare specifier.
   */
  requireShim?: boolean;
  /** Additional banner text, appended after the require shim if both are set. */
  banner?: string;
  /** Raw esbuild options, merged last. */
  esbuild?: EsbuildOverrides;
}

/**
 * Why there are two client output shapes.
 *
 * `module-loader` (the default): the bundle is CJS with its npm dependencies
 * inlined, because the browser module table cannot resolve npm deps. esbuild
 * cannot emit a bare `window.__ModuleLoader__.load` call wrapped around that
 * CJS output, so the facade is written around it afterwards — it supplies the
 * `module`/`exports`/`require` bindings the CJS body expects and stamps
 * `Symbol.toStringTag` so the loader sees a module-shaped object.
 *
 * `iife`: the half has no npm dependencies (dotfiles-ai's profiles-client is
 * the only one), so it can call `window.__ModuleLoader__.load` itself at
 * evaluation time and esbuild's IIFE output needs no facade at all. Not
 * unifying on one wrapper is deliberate: the IIFE form is simpler, and the
 * facade form exists only because esbuild cannot produce the bare load call
 * around an inlined bundle.
 */
export type ClientWrapper = "module-loader" | "iife";

export interface ClientBuild {
  /** Entry point, resolved against the spec's `root`. */
  entry: string;
  /** Output file, resolved against the spec's `root`. */
  outfile: string;
  /** Module id passed to `window.__ModuleLoader__.load`. */
  id: string;
  /** Output shape. Defaults to `"module-loader"`. */
  wrapper?: ClientWrapper;
  /** Extra externals, MERGED with {@link CLIENT_EXTERNAL}. */
  external?: string[];
  /** Raw esbuild options, merged last. */
  esbuild?: EsbuildOverrides;
}

export interface BuildSpec {
  /** Package name, used in log lines and drift reports. */
  name: string;
  /**
   * Directory every relative `entry`/`outfile` resolves against — normally
   * the package directory, so a config can say `dirname(fileURLToPath(...))`.
   */
  root: string;
  host?: HostBuild[];
  client?: ClientBuild[];
  /** esbuild log level for every build in this spec. Defaults to `"info"`. */
  logLevel?: LogLevel;
}

export interface BuildOutput {
  half: "host" | "client";
  /** Owning spec's name. */
  name: string;
  /** Absolute entry path. */
  entry: string;
  /** Absolute output path. */
  outfile: string;
  /** Size of the written file in bytes. */
  bytes: number;
}

/**
 * Identity helper so a package's `build.config.mjs` gets types and a stable
 * shape. The point of the whole module: a package declares its own build
 * instead of being one more pair of strings in a central array.
 */
export function defineBuild(spec: BuildSpec): BuildSpec {
  return spec;
}
