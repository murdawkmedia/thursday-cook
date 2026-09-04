# B1 — dsh branding surface: what dsh reads, and what Thursday can override

Investigated tree: `/home/sid/.local/share/fnm/node-versions/v24.15.0/installation/lib/node_modules/@deepseek-ai/dsh/`
(shown below as `$PKG`). Classification legend: **per-home** (overridable from `$DSH_HOME` — settings, profile patch, or plugin drop-in, so it works against Thursday's pinned runtime in `$THURSDAY_HOME/runtime/` without patching it), **per-profile**, **runtime-plugin** (Cordis host/client plugin at boot), **package-tree** (only by editing the dsh tree — legal only inside `$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh`).

## The serving chain (how branding reaches the browser)

1. `dsh-web-app` resolves the frontend dist from workspace knowledge, not user config:
   `dsh-web-app/lib/index.js` → `require.resolve("@deepseek-ai/dsh-web-frontend/dist/index.html")` (comment: *"Dist location is workspace knowledge of this bundle: resolved through the frontend package exports, not configured."*). Then `ctx.plugin(FrontendStatic, { distIndex: internals.resolveDistIndex() })`.
2. `dsh-host-frontend-static` claims the webserver **fallback seat** and serves the dist. Every index response is rendered through `ctx.webServer.applyIndexTaps(await readFile(distIndex, "utf8"))`.
3. `dsh-host-webserver` exposes two composition points on the `webServer` service:
   - `tapIndex(transform: (html: string) => string): () => void` — *"Register an index.html transform, applied by the fallback owner to every index response (applyIndexTaps) in registration order."*
   - `register(route)` — named routes (exact/prefix), matched **before** the fallback, so a plugin can own `"/manifest.webmanifest"` or `"/favicon.svg"` outright.

This is the load-bearing finding: **the title, manifest link and favicon link in index.html are rewritten at serve time by any host plugin that can reach the `webServer` service.** dsh itself ships zero index taps today (only `dsh-tool-cordis` documents the capability; nothing registers one).

## Per-value findings

| Value | Owning file (quote) | Classification |
| --- | --- | --- |
| Browser tab title | `$PKG/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html`: `<title>DeepSeek Harness</title>` | **runtime-plugin** (host plugin calling `ctx.webServer.tapIndex` to string-replace the `<title>` element). File itself is **package-tree**; the served bytes are not. |
| Manifest link / manifest contents | `index.html`: `<link rel="manifest" href="/manifest.webmanifest" />`; file `dist/manifest.webmanifest`: `"name": "DeepSeek Harness", "short_name": "DSH", "icons": [{"src": "/favicon.svg", ...}]` | Manifest **name/short_name/icons** are **runtime-plugin**: register an exact route for `/manifest.webmanifest` via `webServer.register()` serving a Thursday manifest (exact routes win over the fallback seat). The tap alone cannot change it — taps only touch the HTML body, and the manifest is fetched as its own request. |
| Favicon | `index.html`: `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`; file `dist/favicon.svg` (only icon shipped; manifest and HTML both point at it) | **runtime-plugin**, same mechanism: exact route for `/favicon.svg` serving Thursday's SVG (and/or tap the `<link>` href). |
| Page-visible product name (UI wordmark + whale mark) | `dsh-client-ui-brand-official/lib/client.js` fills slots: `ctx.slots.register({ name: "sidebar.brand.mark" }, OfficialBrandMark)` … `sidebar.brand.name`, `conversation.hero.brand.mark`; the wordmark text lives in the built bundle `dsh-web-frontend/dist/assets/index-*.js` (`BrandWordmark` from `dsh-client-ui-primitives`) | **runtime-plugin (client)**: these are ordinary UI slots; a Thursday client plugin can register the same slot names. Which registration wins when two plugins fill one slot I **could not determine** (dsh's own plugin uses `ctx.slots.inject` nesting; ordering semantics unverified) — must be tested before B3 relies on it. If later registration does not win, this drops to **package-tree** (the built asset bundle). |
| Web app manifest *file path/name* | `dist/manifest.webmanifest` (name fixed in `index.html`) | **package-tree** for the filename; irrelevant if B3 serves its own manifest at the same URL. |
| Desktop entry / `.desktop` file / application-name | **None found.** No `.desktop`, no Electron/Tauri shell, no `app.setApplicationName` anywhere in the tree; the GUI is a plain browser tab over `dsh-host-webserver`. | Nothing to override. If Thursday wants a desktop entry, it is purely a Thursday install artifact (a Thursday-authored `.desktop` that launches the Thursday launcher) — not a dsh value. |
| CLI program name / help text | `lib/bin.js`: `program.name("dsh").version(version, …).description("dsh: boot a DeepSeek Harness profile — …")` | **package-tree** (patchable in Thursday's own runtime copy only). |
| Displayed version | `lib/bin.js`: `const manifest = JSON.parse(readFileSync(new URL("../package.json", …))); return typeof manifest.version === "string" ? manifest.version : "0.0.0"` | **package-tree** (the root `package.json` `version` field of the pinned dsh). |
| `dsh web:` startup line | `dsh-web-app/lib/index.js`: ``console.log(`dsh web: ${webUrl}…`)`` | **package-tree** only. |
| Agent-visible product strings (system prompt) | `dsh-web-app/lib/index.js`: `webSurfacePrompt()` hardcodes "DeepSeek Harness Web GUI"; plus `cordis.patch.yml` row `id: system-prompt` with `persona: You are a coding agent powered by the {{model}} model…` | The **persona row is per-home**: Thursday's generated profile patch (`$THURSDAY_HOME/dsh/profiles/*/cordis.patch.yml`, C4) or agent presets (`dsh/.agent-presets/`, C2/C3) restates the row. The `webSurfacePrompt` function itself is **package-tree** (but only reachable with `surfaceContext` enabled — check whether that config is settable per-profile; `Config = z.object({ surfaceContext: z.boolean().default(true), … })`, so likely yes via a patch row, which would let Thursday *disable* rather than rewrite it). |

## What B3 should implement where

**Install step (Thursday-owned files, no dsh patching) — the whole rebrand can be a single host plugin shipped into Thursday's home:**
- Host plugin under `$THURSDAY_HOME/dsh/plugins/host/` (or a dependency of the generated `profiles/web` composition per C4) that on boot: `tapIndex()` to rewrite `<title>` (and optionally the manifest/icon hrefs), and `register()` exact routes for `/manifest.webmanifest` and `/favicon.svg` serving Thursday's files. This covers tab title, PWA manifest name/icons, and favicon — everything the browser chrome shows. It survives dsh point upgrades because it never touches `$PKG`.
- Client plugin (Thursday's plugins already override dsh's CSS variables) attempting the `sidebar.brand.*` / `conversation.hero.brand.mark` slots — **gated on the slot-precedence test above**.
- Per-home patch rows for the persona/system-prompt text via the C4 profile patch.

**Needs a patch inside Thursday's own runtime copy (`$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh`, reversible by reinstall) — only if B3 also wants:**
- the CLI `--help` name/description and version string,
- the `dsh web:` console line,
- the in-bundle `BrandWordmark` text (should the client-slot route fail),
- the `webSurfacePrompt` sentence shown to agents.

**Not overridable at all, and nothing to do:** desktop entry / application-name — dsh has none; a Thursday desktop entry is new Thursday-authored surface, not an override.

## Could not determine
1. Slot precedence when two client plugins register the same slot name (decides wordmark: runtime-plugin vs package-tree).
2. Whether a profile patch row can retarget `frontend-static`'s `distIndex` (the plugin is mounted inline by `web-app` via `ctx.plugin(...)`, so it is likely not addressable by patch id — if it were, Thursday could point the whole dist at its own copy and skip taps entirely).
3. Whether `web-app`'s `surfaceContext`/`printUrl` config rows are patch-addressable per profile (same inline-plugin concern).
