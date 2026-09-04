# Thursday migration map

<!--
  GENERATED FILE — DO NOT HAND-EDIT.

  Generated from config/migration-map.json by scripts/migration-map.mjs.
  Every edit belongs in the JSON map. Regenerate with:

      node scripts/migration-map.mjs

  Any hand-edit is destroyed by the next run, and
  `node scripts/migration-map.mjs --check` fails while one is present.
-->

> **This file is generated. Do not hand-edit it.**
> The source of truth is [`config/migration-map.json`](../config/migration-map.json).
> Change a rule there and run `node scripts/migration-map.mjs`.

This document is derived from the map alone, so it is byte-identical on every
run against an unchanged map. Live validation against the source repositories
is printed by the script; it is deliberately not baked into this file, which
would make the doc churn every time upstream moved.

## Why JSON and not YAML

The executable migration map. THIS FILE IS THE SOURCE OF TRUTH.
docs/MIGRATION-MAP.md is generated from it by scripts/migration-map.mjs.

Format: JSON, not YAML. Thursday has no package.json and no node_modules, and the
validator must run on a bare checkout with plain `node scripts/migration-map.mjs`.
Node parses JSON natively and has no YAML parser, so YAML would force a first
dependency onto a repo that has none. Comments -- the one thing YAML would have
bought -- are carried by the mandatory `reason` field on every rule and by this
$comment array, so nothing is lost.

Rules are DISJOINT, not first-match. Every tracked file in each source repo must
match exactly one rule. The validator proves that in both directions: an unmatched
path and a doubly-matched path are both errors.

## How to read a rule

Patterns are repo-relative and anchored at both ends:

- `**` — any characters, including /
- `*` — any characters except /
- `?` — one character except /
- `{a,b}` — alternation; an empty branch is allowed, e.g. resume{,.test}.ts
- `anchoring` — patterns are repo-relative and anchored at both ends

Destinations:

- `./` — the Thursday repository root
- `trailing /` — a directory prefix; the source file lands inside it
- `declarative` — the script never moves, copies, deletes or creates any migrated file

Verdicts:

- **move** — the file becomes part of Thursday at the named destination.
- **stay** — the file remains in its source repository and is not Thursday's.
- **drop** — the file is carried over by nobody: build output, a lockfile,
  expired notes, or a test whose subject stops existing.

## The boundary at a glance

| Repository | Rules | move | stay | drop |
| --- | --- | --- | --- | --- |
| `dotfiles-ai` | 90 | 74 | 6 | 10 |
| `aidos` | 27 | 18 | 0 | 9 |
| **total** | **117** | | | |

- `dotfiles-ai` (`/home/sid/repos/dotfiles-ai`) — personal dsh configuration bundle; keeps its personal half and stays under active development
- `aidos` (`/home/sid/repos/aidos`) — the ticketing subsystem; migrates wholesale into packages/aidos

## Skill verdicts

Every skill directory carries its own rule, so a new skill added upstream
matches nothing and is reported as an error rather than absorbed by a wildcard.

| Skill | Verdict | Destination |
| --- | --- | --- |
| `caffeine` | **move** | `skills/caffeine/` |
| `checklist` | **move** | `skills/checklist/` |
| `code-review` | **move** | `skills/code-review/` |
| `codebase-design` | **move** | `skills/codebase-design/` |
| `coder` | **move** | `skills/coder/` |
| `cordis-plugin-development` | **move** | `skills/cordis-plugin-development/` |
| `customize-setup` | **move** | `skills/customize-setup/` |
| `devtunnel` | **stay** | — |
| `diagnosing-bugs` | **move** | `skills/diagnosing-bugs/` |
| `domain-modeling` | **move** | `skills/domain-modeling/` |
| `easyeda` | **move** | `skills/easyeda/` |
| `ecommerce` | **stay** | — |
| `editing-cordis-compositions` | **move** | `skills/editing-cordis-compositions/` |
| `etu` | **move** | `skills/etu/` |
| `expense-split` | **stay** | — |
| `grill-with-docs` | **move** | `skills/grill-with-docs/` |
| `grilling` | **move** | `skills/grilling/` |
| `improve-codebase-architecture` | **move** | `skills/improve-codebase-architecture/` |
| `nostr` | **move** | `skills/nostr/` |
| `plan` | **move** | `skills/plan/` |
| `prototype` | **move** | `skills/prototype/` |
| `research` | **move** | `skills/research/` |
| `researcher` | **move** | `skills/researcher/` |
| `resume` | **move** | `skills/resume/` |
| `review` | **move** | `skills/review/` |
| `session-search` | **move** | `skills/session-search/` |
| `share-caddy-cert` | **stay** | — |
| `software-engineering` | **move** | `skills/software-engineering/` |
| `ste-writing` | **move** | `skills/ste-writing/` |
| `tdd` | **move** | `skills/tdd/` |
| `tester` | **move** | `skills/tester/` |
| `to-spec` | **move** | `skills/to-spec/` |
| `to-tickets` | **move** | `skills/to-tickets/` |
| `util` | **move** | `skills/util/` |
| `verification` | **move** | `skills/verification/` |
| `wizard` | **move** | `skills/wizard/` |
| `working-with-soapbox` | **stay** | — |

From `aidos`:

| Skill | Verdict | Destination |
| --- | --- | --- |
| `aidos-plan` | **move** | `skills/aidos-plan/` |

## Plugin verdicts

Every plugin — the single-file host plugins and the client packages alike —
carries its own rule and its own destination directory under
`packages/plugins/`.

| Plugin | Verdict | Destination |
| --- | --- | --- |
| `(drop) plugins/*.js` | **drop** | — |
| `(drop) plugins/sync.test.ts` | **drop** | — |
| `approval-comment` | **move** | `packages/plugins/approval-comment/` |
| `ask-interrupt` | **move** | `packages/plugins/ask-interrupt/` |
| `bash-guard` | **move** | `packages/plugins/bash-guard/` |
| `composer-menu` | **move** | `packages/plugins/composer-menu/` |
| `context-meter` | **move** | `packages/plugins/context-meter/` |
| `durable-todos` | **move** | `packages/plugins/durable-todos/` |
| `grant` | **move** | `packages/plugins/grant/` |
| `job-viewer` | **move** | `packages/plugins/job-viewer/` |
| `llm-pi-ai` | **move** | `packages/plugins/llm-pi-ai/` |
| `log-exporter` | **move** | `packages/plugins/log-exporter/` |
| `log-viewer` | **move** | `packages/plugins/log-viewer/` |
| `manifest-guard` | **move** | `packages/plugins/manifest-guard/` |
| `mcp-servers` | **move** | `packages/plugins/mcp-servers/` |
| `package-tool` | **move** | `packages/plugins/package-tool/` |
| `profiles` | **move** | `packages/plugins/profiles/` |
| `profiles-client` | **move** | `packages/plugins/profiles-client/` |
| `resume` | **move** | `packages/plugins/resume/` |
| `see` | **move** | `packages/plugins/see/` |
| `session-archive` | **move** | `packages/plugins/session-archive/` |
| `shared` | **move** | `packages/plugins/shared/` |
| `skill-gate` | **move** | `packages/plugins/skill-gate/` |
| `subscriptions` | **move** | `packages/plugins/subscriptions/` |
| `system-fonts` | **move** | `packages/plugins/system-fonts/` |
| `tmp-dsh-shared` | **move** | `packages/plugins/tmp-dsh-shared/` |
| `tool-render` | **move** | `packages/plugins/tool-render/` |
| `tooltips` | **move** | `packages/plugins/tooltips/` |

## Rules — `dotfiles-ai`

| Source pattern | Verdict | Reason |
| --- | --- | --- |
| `.gitignore` | **drop** | Ignores paths that only exist in the personal bundle layout. Thursday already has its own. |
| `.prettier{rc.json,ignore}` | **move** → `./` | Formatting conventions are general and shared by every package; they belong at the Thursday root. |
| `LICENSE` | **drop** | Thursday carries its own root LICENSE. Two licence files in one tree is a bug, not a merge. |
| `README.md` | **drop** | Describes a personal, opinionated bundle and warns that sync.sh overwrites your config. Thursday's README is a different document for a different audience. |
| `{PLAN.md,PLAN-AUDIT.md,handoff.md}` | **drop** | Session-scoped working notes. PLAN-AUDIT.md says of itself 'This file is temporary'; handoff.md hands over one dead session. None of it is product. |
| `package.json` | **move** → `./` | The dependency set and script names seed the Thursday root manifest. Merged, not copied: aidos's manifest lands at packages/aidos/package.json. |
| `pnpm-workspace.yaml` | **move** → `./` | Thursday is one pnpm workspace; this file becomes its root, with the packages/* globs widened. |
| `pnpm-lock.yaml` | **drop** | A lockfile is derived. Thursday's is regenerated from its own merged manifests; carrying this one over would encode two repos' resolutions. |
| `tsconfig.json` | **move** → `./` | The compiler settings the plugins are written against become the root tsconfig every package extends. |
| `vitest.config.ts` | **move** → `./` | One test runner config at the root; per-package configs extend it. |
| `build.mjs` | **move** → `packages/build/` | The esbuild host/client bundling pipeline, including the client module-loader facade wrapper and the createRequire banner workarounds, is the whole content of packages/build. |
| `sync.sh` | **move** → `packages/install/` | REWRITE, NOT A COPY. Every install step -- build, skill/guard/AGENTS.md sync, web profile patch, plugin registration, aidos install, settings regeneration -- is reimplemented as the TypeScript install engine. The bash file is the specification for that engine and is deleted once each step has an implementation. |
| `sync-models.mjs` | **move** → `scripts/` | General model-catalog seeding: it reads the settings template and asks each provider what it serves. The hardcoded personal provider list becomes config-driven on the way over. |
| `generate-customize-setup.mjs` | **move** → `scripts/` | Generates skills/customize-setup/SKILL.md from its template; that skill moves, so its generator must move with it. |
| `scripts/pin-aidos.sh` | **drop** | Pushes aidos and rewrites the git SHA pin in sync.sh. In Thursday aidos is an in-repo workspace package, so there is no external pin and no operation left to perform. |
| `scripts/unshadow-compactions.py` | **move** → `scripts/` | Repairs a compaction-shadowed dsh session log. Nothing personal in it; it is a general harness recovery tool. |
| `src/DESIGN.md` | **move** → `packages/tokens/` | The dark settings form-control design system is the written spec for the token package the plugin clients render against. |
| `experiments/**` | **drop** | A time-boxed personal experiment with an owner, a start date and a 2026-09-07 check-back, plus its two throwaway session-log scanners. It expires; it does not ship. |
| `mcp-servers.json` | **stay** | Settled boundary: the personal half stays. Six of the seven entries are the author's own accounts and shopping (nostrbook, easyeda, blinkit, swiggy-food, swiggy-instamart, zepto).<br>**Partial:** the `gitlab` entry (glab mcp serve) → `config/mcp-servers.example.json`. The one general-purpose server is EXTRACTED as a one-entry example file that documents the schema. The file itself stays; only that entry is copied. |
| `guards/*.json` | **move** → `config/guards/` | The bash-guard rule set (find, git, grep, nav, rg) is general tool discipline, not personal preference. |
| `guards/profile-*/*.json` | **move** → `config/guards/` | Per-profile guard overlays for the planning and awaiting_verification states; they belong with the profiles Thursday ships. |
| `home/AGENTS.md` | **move** → `config/` | Settled boundary: home/AGENTS.md moves. It is the installed-home agent instruction file, general to every Thursday install. |
| `home/settings.yaml` | **move** → `config/` | Settled boundary: the settings template moves. Lands as config/settings.template.yaml; the install engine renders it and no credential is ever in it. |
| `plugins/ask-interrupt.ts` | **move** → `packages/plugins/ask-interrupt/` | Host plugin. Each single-file host plugin becomes its own directory under packages/plugins so it can carry a manifest and tests. |
| `plugins/bash-guard*.ts` | **move** → `packages/plugins/bash-guard/` | Host plugin, plus its bash-guard-translate module and four test files. bash-guard-translate is not a separate plugin: it is imported only by bash-guard.ts and ships inside the same bundle. |
| `plugins/grant.ts` | **move** → `packages/plugins/grant/` | Host plugin. |
| `plugins/log-exporter.ts` | **move** → `packages/plugins/log-exporter/` | Host plugin. |
| `plugins/manifest-guard.ts` | **move** → `packages/plugins/manifest-guard/` | Host plugin. |
| `plugins/package-tool.ts` | **move** → `packages/plugins/package-tool/` | Host plugin. |
| `plugins/profiles.ts` | **move** → `packages/plugins/profiles/` | Host plugin. Its browser half is the separate profiles-client package. |
| `plugins/resume{,.test}.ts` | **move** → `packages/plugins/resume/` | Host plugin and its test. |
| `plugins/see.ts` | **move** → `packages/plugins/see/` | Host plugin; owner of the `profile` settings namespace. |
| `plugins/skill-gate{,.test}.ts` | **move** → `packages/plugins/skill-gate/` | Host plugin and its test. |
| `plugins/tmp-dsh-shared.ts` | **move** → `packages/plugins/tmp-dsh-shared/` | Host plugin. The tmp- prefix marks it as a stopgap for a missing dsh export; it moves as-is and is retired when upstream exports it. |
| `plugins/profile-routes.ts` | **move** → `packages/plugins/shared/` | Not a plugin: the shared route-chain model imported by profiles.ts, see.ts, profiles-client and subscriptions. It has no built .js because esbuild always inlines it. |
| `plugins/shared/**` | **move** → `packages/plugins/shared/` | Shared client React helpers, HTTP helper, settings panel and stylesheet used by the client halves. A support module, not a plugin, and it keeps that status in Thursday. |
| `plugins/sync.test.ts` | **drop** | Runs `bash -n sync.sh` and greps for step markers. Its own header says the fix it guards had 'no extractable runtime logic'. sync.sh is being rewritten in TypeScript, so the test loses its subject; the install engine gets real unit tests instead. |
| `plugins/*.js` | **drop** | The eleven committed esbuild bundles of the single-file host plugins. Thursday builds them from .ts via packages/build; committing artifacts beside their source lets the two drift from commit one. |
| `plugins/approval-comment/**`<br>_except_ `plugins/approval-comment/{lib,dist}/**` | **move** → `packages/plugins/approval-comment/` | Client plugin package: source, manifest and cordis patch move; built bundles do not. |
| `plugins/composer-menu/**`<br>_except_ `plugins/composer-menu/{lib,dist}/**` | **move** → `packages/plugins/composer-menu/` | Client plugin package. |
| `plugins/context-meter/**`<br>_except_ `plugins/context-meter/{lib,dist}/**` | **move** → `packages/plugins/context-meter/` | Client plugin package. |
| `plugins/durable-todos/**`<br>_except_ `plugins/durable-todos/{lib,dist}/**` | **move** → `packages/plugins/durable-todos/` | Client plugin package with a host-side projection module and its test. |
| `plugins/job-viewer/**`<br>_except_ `plugins/job-viewer/{lib,dist}/**` | **move** → `packages/plugins/job-viewer/` | Client plugin package; the largest one, with buffer, completion, poller, route, public-job and tools modules and a test beside each. |
| `plugins/log-viewer/**`<br>_except_ `plugins/log-viewer/{lib,dist}/**` | **move** → `packages/plugins/log-viewer/` | Client plugin package. |
| `plugins/mcp-servers/**`<br>_except_ `plugins/mcp-servers/{lib,dist}/**` | **move** → `packages/plugins/mcp-servers/` | Client plugin package with OAuth, connection, config and store modules. The PLUGIN is general; only the mcp-servers.json server LIST is personal, and that file stays. |
| `plugins/profiles-client/**`<br>_except_ `plugins/profiles-client/{lib,dist}/**` | **move** → `packages/plugins/profiles-client/` | Client plugin package: the browser half of profiles. Its README moves with it. |
| `plugins/session-archive/**`<br>_except_ `plugins/session-archive/{lib,dist}/**` | **move** → `packages/plugins/session-archive/` | Client plugin package. |
| `plugins/subscriptions/**`<br>_except_ `plugins/subscriptions/{lib,dist}/**` | **move** → `packages/plugins/subscriptions/` | Client plugin package. It needs the user's own credentials at runtime, but the panel itself is general and no account data is in the source. |
| `plugins/system-fonts/**`<br>_except_ `plugins/system-fonts/{lib,dist}/**` | **move** → `packages/plugins/system-fonts/` | Client plugin package. |
| `plugins/tool-render/**`<br>_except_ `plugins/tool-render/{lib,dist}/**` | **move** → `packages/plugins/tool-render/` | Client plugin package. Becomes the single home of the tool-card renderer: aidos's vendored copy of it is dropped in favour of a workspace import of this package. |
| `plugins/tooltips/**`<br>_except_ `plugins/tooltips/{lib,dist}/**` | **move** → `packages/plugins/tooltips/` | Client plugin package. |
| `plugins/llm-pi-ai/**` | **move** → `packages/plugins/llm-pi-ai/` | Vendored fork of the dsh llm-pi-ai builtin that enables session-affinity headers for anthropic-messages routes. Unlike every other package its lib/ IS the source -- there is no src/ -- so nothing here is build output and the artifact drop rule explicitly excludes it. Pinned to a dsh RC and re-checked on every dsh upgrade. |
| `plugins/*/{lib,dist}/**`<br>_except_ `plugins/llm-pi-ai/**` | **drop** | Committed esbuild output for the client plugin packages. Thursday builds these from src/ via packages/build; carrying compiled bundles into the new repo would let source and artifact drift from commit one. |
| `skills/caffeine/**` | **move** → `skills/caffeine/` | Explicit decision: moves despite looking borderline personal. Keeping a machine awake across a long unattended run is a general agent need. |
| `skills/etu/**` | **move** → `skills/etu/` | Explicit decision: moves. |
| `skills/easyeda/**` | **move** → `skills/easyeda/` | Explicit decision: moves. Its matching easyeda MCP server entry stays behind in the personal mcp-servers.json, so the skill ships without a preconfigured server. |
| `skills/nostr/**` | **move** → `skills/nostr/` | Explicit decision: moves. Its matching nostrbook MCP server entry stays behind in the personal mcp-servers.json. |
| `skills/ecommerce/**` | **stay** | Settled boundary: stays. Drives the author's own grocery and food-delivery MCP servers. |
| `skills/expense-split/**` | **stay** | Settled boundary: stays. The author's Splitwise workflow, including its dashboard and push scripts. |
| `skills/working-with-soapbox/**` | **stay** | Settled boundary: stays. Specific to one codebase the author works on. |
| `skills/devtunnel/**` | **stay** | Settled boundary: stays. Bound to the author's own tunnel host, and it ships a personal helper binary. |
| `skills/share-caddy-cert/**` | **stay** | Settled boundary: stays. Specific to the author's Caddy deployment. |
| `skills/checklist/**` | **move** → `skills/checklist/` | General working method. |
| `skills/code-review/**` | **move** → `skills/code-review/` | General engineering skill, with its openai agent profile. |
| `skills/codebase-design/**` | **move** → `skills/codebase-design/` | General engineering skill, with its DEEPENING and DESIGN-IT-TWICE references. |
| `skills/coder/**` | **move** → `skills/coder/` | General role skill. |
| `skills/cordis-plugin-development/**` | **move** → `skills/cordis-plugin-development/` | General harness skill; Thursday ships the plugin system it documents. |
| `skills/customize-setup/**` | **move** → `skills/customize-setup/` | General onboarding skill. Its SKILL.md is generated from template.md; both move, and so does the generator. |
| `skills/diagnosing-bugs/**` | **move** → `skills/diagnosing-bugs/` | General engineering skill, with its agent profile and HITL loop template. |
| `skills/domain-modeling/**` | **move** → `skills/domain-modeling/` | General engineering skill, with its ADR and context format references. |
| `skills/editing-cordis-compositions/**` | **move** → `skills/editing-cordis-compositions/` | General harness skill. |
| `skills/grill-with-docs/**` | **move** → `skills/grill-with-docs/` | General verification skill. |
| `skills/grilling/**` | **move** → `skills/grilling/` | General verification skill. |
| `skills/improve-codebase-architecture/**` | **move** → `skills/improve-codebase-architecture/` | General engineering skill, with its HTML report format. |
| `skills/plan/**` | **move** → `skills/plan/` | General planning skill. Distinct from aidos's aidos-plan skill, which is about the ticket board's plan format; both land in skills/ without colliding. |
| `skills/prototype/**` | **move** → `skills/prototype/` | General engineering skill, with its LOGIC and UI references. |
| `skills/research/**` | **move** → `skills/research/` | General skill. |
| `skills/researcher/**` | **move** → `skills/researcher/` | General role skill. |
| `skills/resume/**` | **move** → `skills/resume/` | General harness skill; pairs with the resume plugin. |
| `skills/review/**` | **move** → `skills/review/` | General role skill. |
| `skills/session-search/**` | **move** → `skills/session-search/` | General harness skill: searching dsh session logs. |
| `skills/software-engineering/**` | **move** → `skills/software-engineering/` | General engineering skill. |
| `skills/ste-writing/**` | **move** → `skills/ste-writing/` | General writing skill. |
| `skills/tdd/**` | **move** → `skills/tdd/` | General engineering skill, with its mocking and tests references. |
| `skills/tester/**` | **move** → `skills/tester/` | General role skill. |
| `skills/to-spec/**` | **move** → `skills/to-spec/` | General planning skill. |
| `skills/to-tickets/**` | **move** → `skills/to-tickets/` | General planning skill; feeds the aidos board. |
| `skills/util/**` | **move** → `skills/util/` | General utility skill. |
| `skills/verification/**` | **move** → `skills/verification/` | General verification skill. |
| `skills/wizard/**` | **move** → `skills/wizard/` | General skill and the seed of Thursday's wizards/ directory; its template.sh moves with it. |

## Rules — `aidos`

| Source pattern | Verdict | Reason |
| --- | --- | --- |
| `.gitignore` | **drop** | Thursday's root .gitignore covers the whole workspace. |
| `LICENSE.md` | **drop** | Thursday carries one root LICENSE. |
| `PLAN.md` | **drop** | The aidos build's own ticket list and working notes. Thursday has its own PLAN.md. |
| `README.md` | **move** → `packages/aidos/` | Explains what aidos is and why the name; that is exactly a package README. |
| `{SPEC-B1.md,UI-SPEC.md}` | **move** → `packages/aidos/docs/` | Still-authoritative design specs for the tool surface and the board UI. |
| `docs/**` | **move** → `packages/aidos/docs/` | Verified research on the dsh seams the board uses, plus the skills port inventory. |
| `build.mjs` | **move** → `packages/aidos/` | aidos-specific esbuild entry points. Stays package-local until packages/build grows a config surface that can absorb it. |
| `cordis.patch.yml` | **move** → `packages/aidos/` | The plugin's cordis composition rows; a package-level manifest, same as every plugin package. |
| `{dist,lib}/**` | **drop** | Committed esbuild output: a 1.0 MB host bundle and a 0.5 MB client bundle. Built from src/ in Thursday, never committed. |
| `package.json` | **move** → `packages/aidos/` | Becomes the workspace package manifest; the git-spec install path it was published for disappears. |
| `pnpm-lock.yaml` | **drop** | Derived; Thursday's root lockfile replaces it. |
| `pnpm-workspace.yaml` | **drop** | aidos stops being its own workspace root. Thursday's root pnpm-workspace.yaml, inherited from dotfiles-ai, owns the workspace. |
| `tsconfig{,.client,.tests}.json` | **move** → `packages/aidos/` | Three build targets (host, client, tests) with genuinely different settings; they stay package-local and extend the Thursday root tsconfig. |
| `vitest.config.ts` | **move** → `packages/aidos/` | Package-level test config extending the Thursday root config. |
| `patches/**` | **move** → `packages/install/patches/` | Idempotent exact-string patches to the installed dsh tree that aidos needs. Applying them is an install step, so they live with the install engine that replaces sync.sh. |
| `presets/**` | **move** → `profiles/` | Settled: presets become profiles. Lands as packages/aidos/presets/ alongside profiles/thursday and profiles/quick. |
| `skills/aidos-plan/**` | **move** → `skills/aidos-plan/` | Settled: aidos skills join the shared skills tree. Lands as skills/aidos-plan/ with its import template and plan verifier. |
| `src/kernel/**` | **move** → `packages/aidos/src/kernel/` | The pure domain kernel: events, fold, gates, projections, store, invariants, types. The heart of the subsystem. |
| `src/host/**` | **move** → `packages/aidos/src/host/` | The dsh host plugin that mounts the kernel and wires session events. |
| `src/tools/**`<br>_except_ `src/tools/*.backup` | **move** → `packages/aidos/src/tools/` | The board tools, allowlist, guard, mask, preset gate and scratch surface. |
| `src/tools/*.backup` | **drop** | src/tools/aidos-tools.ts.backup is a stray editor backup of a file already tracked beside it. Committed by accident; it must not be carried forward. |
| `src/plan/**` | **move** → `packages/aidos/src/plan/` | The plan markdown serializer and importer. |
| `src/client/**`<br>_except_ `src/client/vendor/**` | **move** → `packages/aidos/src/client/` | The board's browser half: rows, tiles, detail panel, evidence surface, modals and stylesheets. |
| `src/client/vendor/**` | **drop** | A verbatim vendored copy of dotfiles-ai's tool-render text helpers and stylesheet; its SOURCE.json names /home/sid/repos/dotfiles-ai/plugins/tool-render/src as the origin. It exists only because aidos was a separate repo forbidden from depending on anything external. In one Thursday monorepo both halves are siblings, so this becomes a workspace import of packages/plugins/tool-render. |
| `tests/**`<br>_except_ `tests/PORT-MAP*.md`, `tests/u82-vendor-drift.test.ts` | **move** → `packages/aidos/tests/` | Settled: tests move alongside their package. They exercise kernel, tools, host and client together, so they stay one suite rather than being split per source directory. |
| `tests/PORT-MAP*.md` | **move** → `packages/aidos/docs/` | Prose port inventories that happen to live under tests/. They are documentation, so they land with the package docs, not with the suite. |
| `tests/u82-vendor-drift.test.ts` | **drop** | Guards the vendored tool-render copy against upstream drift. That copy is dropped in favour of a workspace import, so drift becomes structurally impossible and the test has nothing left to assert. |
