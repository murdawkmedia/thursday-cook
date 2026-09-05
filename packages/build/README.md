# @trythursday/build

The shared esbuild pipeline for dsh plugin host and client halves.

Extracted from `dotfiles-ai/build.mjs`, a 408-line script that hard-coded
about 25 entry points in one array. This is a library instead: a package
declares its own build and nothing central has to be edited to add one.

## Declaring a build

Drop a `build.config.mjs` in the package directory:

```js
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineBuild } from "@trythursday/build";

export default defineBuild({
  name: "mcp-servers",
  root: dirname(fileURLToPath(import.meta.url)),
  host: [
    // @modelcontextprotocol/sdk is a real dependency and MUST be bundled, so
    // it is deliberately absent from `external`. cross-spawn, which the SDK's
    // stdio transport pulls in, calls require("child_process") by bare
    // specifier, so this half needs the require shim.
    { entry: "src/index.ts", outfile: "lib/index.js", requireShim: true },
  ],
  client: [{ entry: "src/client.tsx", outfile: "lib/client.js", id: "mcp-servers" }],
});
```

`packages/build/build.config.mjs` is the working reference; it builds the
fixtures under `fixtures/`.

## API

| Export                                                                             | What it does                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `defineBuild(spec)`                                                                | Identity helper that types a `BuildSpec`.                                   |
| `buildPackage(spec)`                                                               | Builds every half a spec declares; returns `BuildOutput[]`.                 |
| `buildAll(specs)`                                                                  | Builds many specs.                                                          |
| `discoverBuildSpecs(root, dirs?)`                                                  | Finds every `build.config.mjs` under `packages/*` and `packages/plugins/*`. |
| `runBuild({ specs?, cwd?, argv? })`                                                | Build entry point; honours `--check`. Returns an exit code.                 |
| `buildHost(spec, ctx)` / `hostBuildOptions(spec, ctx)`                             | One host half; the second returns the esbuild options without running them. |
| `buildClient(spec, ctx)` / `clientBuildOptions(spec, ctx, outfile)`                | Same for a client half.                                                     |
| `wrapModuleLoaderFacade(id, bundled)`                                              | The `window.__ModuleLoader__.load` facade, byte-identical to the original.  |
| `assertNoAutomaticJsxRuntime(code, entry)`                                         | Throws if a client bundle reached for `react/jsx-runtime`.                  |
| `checkDrift(outfiles, cwd)`                                                        | Compares built outputs against what git has committed.                      |
| `cssTextPlugin`                                                                    | Resolves `.css` imports to a default-exported string.                       |
| `HOST_EXTERNAL`, `CLIENT_EXTERNAL`, `CREATE_REQUIRE_BANNER`, `CLIENT_TSCONFIG_RAW` | The shared constants.                                                       |

Scripts: `build` (compile this package), `build:all` (build every package that
declares a config; pass `--check` for drift), `typecheck`, `test`, `verify`
(build the fixtures and print the evidence for each bundling guarantee).

## The two modes

**Host half** — platform `node`, format `esm`, `external: ["@deepseek-ai/*",
"node:*"]`. Everything else is bundled so the plugin file is self-contained.
The dsh packages stay external because the loader resolves them from the host
base (the profile's `node_modules`) at runtime; bundling them would hand the
plugin a second, non-identical copy of the runtime it is extending.

**Client half** — platform `browser`, format `cjs`, target `es2022`,
`external: ["react", "react-dom", "react-dom/client", "@deepseek-ai/*"]`, JSX
transformed to the lowercase `react` global, then wrapped in the module-loader
facade.

## Load-bearing details

- **Bare `react-dom` is external, not only `react-dom/client`.** The module
  loader supplies it, and four shipped dsh bundles already require it that way
  (`dsh-client-ui-trajectory`, `-renderer`, `-message-feedback`,
  `-attachment`). Without the bare specifier any dependency that portals pulls
  a second copy of react-dom into the bundle — about 130 KB.
- **The `createRequire` banner** (`requireShim: true`). A bundled dependency
  may call `require()` with a _bare_ specifier: cross-spawn does
  `require("child_process")`, the `yaml` composer does `require("process")`.
  The `node:*` external pattern does not match a bare specifier, so esbuild
  inlines its `__require` shim, and that shim throws in ESM output because no
  `require` binding exists. The shim checks `typeof require !== "undefined"`
  first, so restoring a real `require` satisfies it. Without the banner the
  whole plugin tree fails to load and dsh does not boot — one unbannered host
  half takes down every plugin, not just its own.
- **Two client output shapes.** `module-loader` (the default) bundles CJS with
  npm dependencies inlined, because the browser module table cannot resolve
  npm deps; esbuild cannot emit a bare `window.__ModuleLoader__.load` call
  around that output, so the facade is written afterwards to supply
  `module`/`exports`/`require` and stamp `Symbol.toStringTag`. `iife` is for a
  half with no npm dependencies (dotfiles-ai's `profiles-client`): it calls
  `window.__ModuleLoader__.load` itself and needs no facade. The IIFE form is
  simpler; the facade exists only because esbuild cannot produce the bare call
  around an inlined bundle.
- **The `css-text` plugin.** A client half ships as one JavaScript module, so
  styles must arrive as text it injects itself. The resolve hook re-anchors
  the specifier against `args.resolveDir` before the load hook reads it.
- **`--check` drift mode.** Rebuild, then ask git whether the committed
  bundles differ. For a repository that commits its bundles, a stale one is a
  real defect this catches.

## What changed from the original, and why

- **A library, not a script.** Packages declare their own builds;
  `discoverBuildSpecs` replaces the central array.
- **`absWorkingDir` is pinned to the spec root.** esbuild writes each module's
  path into the output as a `// path/to/file.ts` comment, _relative to its
  working directory_. The original inherited `process.cwd()`, so identical
  sources produced different bytes depending on where you ran it, and the
  drift check reported drift that did not exist. With this pinned, all seven
  dotfiles-ai bundles rebuilt through this module are byte-identical to the
  committed ones.
- **Client JSX settings are pinned with `tsconfigRaw`.** esbuild lets a
  discovered `tsconfig.json` override the `jsx`/`jsxFactory` _build_ options.
  This workspace's root tsconfig sets `"jsx": "react-jsx"`, which silently
  compiled a client half to the automatic runtime and emitted
  `require("react/jsx-runtime")` — a module the browser loader cannot supply.
  A half that needs `paths` aliases sets `tsconfig` on its spec instead
  (`tsconfigRaw` disables tsconfig discovery), pointing at a `"jsx": "react"`
  config such as the workspace's `tsconfig.client.json`.
  `assertNoAutomaticJsxRuntime` is the backstop.
- **`checkDrift` refuses to pass vacuously.** The original ran
  `git diff --exit-code` over globs; if the outputs are untracked — and this
  workspace's `.gitignore` ignores `dist/` and `lib/` — git exits zero and the
  check passes without checking anything. It now partitions paths with
  `git ls-files` and reports `vacuous` when nothing is tracked.
- **`external` merges rather than replaces**, so a spec adding `lz4` (the
  native addon esbuild cannot bundle, as `subscriptions` needs) keeps the
  defaults.
- **`bash-guard`'s special case is gone as a special case.** It was a
  separate hand-written `build()` call purely for its banner; it is now
  `requireShim: true`.

## Dependencies

None declared. `esbuild` is the workspace root's shared toolchain, which
`pnpm-workspace.yaml` documents as intentional; this package resolves it from
there rather than pinning a second copy.
