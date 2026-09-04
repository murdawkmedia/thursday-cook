---
title: Thursday implementation plan
product: Thursday
subsystem: AIDOS
runtime: DeepSeek Harness (dsh)
---

# Thursday implementation plan

Thursday is a full AI development environment that makes cheap models useful by
front-loading planning, bounding work into AIDOS tickets, running agents in the
background, and keeping the user in control. This document is the migration and
implementation plan. Delete it when the work ships.

## Vision

Thursday is the complete product. AIDOS is its planning and ticketing
subsystem. Quick is its lightweight workflow. DSH is its runtime. This monorepo
owns the composition.

Today the product is split across two repositories that only work together by
accident: `~/repos/aidos` ships the ticket board as an installable dsh plugin,
and `~/repos/dotfiles-ai` is a personal bundle whose `sync.sh` installs aidos
from a pinned GitHub commit alongside twenty-odd plugin forks. Neither
repository owns the product. This plan moves the general-purpose half of both
into `~/repos/thursday`, replaces the shell installer with a TypeScript install
engine driven by declarative plugin blocks, adds the Thursday and Quick
presets, gives the environment its own DSH home, and ships a website and a
public demo.

## Critical context

These are the facts the migration depends on. They came from a full read of
both source repositories on 2026-09-04 and would cost real time to rediscover.

The two source repositories, at the commits inspected:

```text
~/repos/aidos        7d5fba8  210 tracked files
~/repos/dotfiles-ai  18a3682  254 tracked files
```

`aidos` is a single npm package named `aidos`, installed with
`dsh plugin add github:xyzshantaram/aidos#<sha>`. Its shape:

```text
src/kernel/     the domain kernel: fold, gates, store, projections, invariants
src/host/       aidos-core service, session events, invariant companion
src/tools/      the six board tools, guards, masks, allowlist, scratch, preset gate
src/plan/       parsePlan: the PLAN.md import grammar
src/client/     the board UI (~45 modules, React, CSS modules, vendored highlight)
presets/aidos/  agent.cordis.yml + aidos-tools.js + preset.yml
skills/         aidos-plan (SKILL.md, PLAN_IMPORT_TEMPLATE.md, verify-plan.mjs)
patches/        apply-dsh-patches.sh: the fs-sandbox scratch-root exemption
tests/          ~90 vitest files
cordis.patch.yml  mounts dsh-invariants then aidos-core on the host plane
```

`dotfiles-ai` is a personal dsh bundle. Its shape:

```text
plugins/*.ts        host-plane plugins, each esbuild-bundled to a sibling .js
plugins/<name>/     client plugin packages, each with its own cordis.patch.yml
guards/*.json       bash-guard rule drop-ins, including per-profile phase rules
home/               AGENTS.md and settings.yaml, copied verbatim into $DSH_HOME
skills/             38 skills, of which most are general and a few are personal
build.mjs           esbuild pipeline: 11 host bundles plus 10 client packages
sync.sh             1134 lines, 18 ordered steps, the whole installation system
mcp-servers.json    the MCP server roster copied into $DSH_HOME
```

The host-plane plugin forks and originals that must move into Thursday:

```text
bash-guard  manifest-guard  package-tool  skill-gate  see  tmp-dsh-shared
grant  ask-interrupt  profiles  resume  log-exporter
```

The client plugin packages that must move into Thursday:

```text
approval-comment  composer-menu  context-meter  durable-todos  job-viewer
log-viewer  mcp-servers  profiles-client  session-archive  subscriptions
system-fonts  tool-render  llm-pi-ai (vendored fork)
```

`job-viewer` is unfinished: it has `src/` but no `package.json`, no
`cordis.patch.yml`, and no build entry. The last dotfiles-ai commit is its
first ticket.

Third-party plugins are not forked. They are pinned specs installed by
`sync.sh` step 9. The roster is data, not code, and belongs in an install
block: `dsh-input-history`, `dsh-tool-calculator`, `dsh-tool-diff`,
`dsh-tool-time`, `dsh-tool-regex`, `dsh-tool-markdown`, `dsh-tool-encoding`,
`dsh-at-file`, `dsh-session-search`, `dsh-plugin-better-mobile-ui`,
`dsh-better-markdown`, `dsh-paste-to-path`, plus two forks the user maintains
elsewhere (`xyzshantaram/dsh-remote`, `xyzshantaram/dsh-compaction-instant`,
the latter installed under the `@deepseek-ai/dsh-compaction-basic` alias on
purpose so it shadows the builtin instead of adding duplicate rows).

What `sync.sh` does that the TypeScript engine must reproduce, in effect
rather than line by line:

```text
build plugin bundles                       install third-party plugin specs
copy skills into $DSH_HOME/skills          install the aidos plugin from git
copy AGENTS.md                             copy aidos skills from the pinned commit
copy bash-guard rules into plugins/guards  patch the shipped standard preset (3 steps)
copy mcp-servers.json                      register the aidos agent preset
write profiles/web/cordis.patch.yml        verify builtin tool rows are disabled
add pnpm allowBuilds entries               regenerate settings.yaml from the template
```

Three of those steps edit the installed dsh tree in place: they pin subagents
onto the subagent chain, turn on Code Mode, and disable `tool-bash` and
`tool-goal` in the shipped `standard` preset. Thursday must not do that. A
dedicated DSH home means Thursday ships its own presets and leaves the user's
dsh install alone. This is the single largest behavioral change in the
migration and every install-engine ticket depends on it.

`sync.sh` also has no uninstall and no status. It only ever adds; it prints
removal commands for extra plugins and leaves the user to run them. Reversal is
new work, and it is what the plugin block model exists to provide.

The AIDOS plan-import grammar constrains this very document. `plan_import`
needs an empty project, lands every ticket in `open`, and records the checkbox
mark as `builtin:imported_state` evidence. Each ticket is one `- [ ] **Ticket
ID: Title.**` line plus two-space continuation lines, and every ticket must
carry an `**Evaluate:**` marker alone on its own line followed by `- ` criteria.
A `### ` heading breaks the parse, so this document uses only `## `. Verify with
`node skills/aidos-plan/verify-plan.mjs PLAN.md` before importing.

The one required dsh patch today is the fs-sandbox exemption for the aidos
durable scratch root, applied by `patches/apply-dsh-patches.sh` after every dsh
or aidos reinstall. A dedicated DSH home does not remove the need for it,
because the patch lives in the dsh package tree, not in the home. Ticket A6
decides whether Thursday keeps patching, upstreams the fix, or moves the
scratch root somewhere the sandbox already allows.

## The repository boundary

Thursday takes everything general. `dotfiles-ai` keeps the personal shell.
The explicit exception named by the brief is the ecommerce skill and its
related tools. The boundary below was settled with the user on 2026-09-04.

Stays in `dotfiles-ai`:

```text
skills/ecommerce             the delivery-platform MCP skill named by the brief
skills/expense-split         consumes the same order data; Tkinter + Splitwise
skills/working-with-soapbox  one specific third-party project's issue tracker
skills/devtunnel             potato.local LAN tunnel
skills/share-caddy-cert      potato.local LAN certificate sharing
mcp-servers.json             the personal half of the roster (see X1)
```

Promoted to Thursday on the user's decision. Each one carries a cross-platform
obligation it does not meet today:

```text
skills/caffeine   genuinely useful; today it is not even Linux-general (see V5)
skills/etu        useful time tracking; the CLI must install on all three systems
skills/easyeda    MCP-gated, mostly OS-neutral
skills/nostr      MCP-gated, mostly OS-neutral
```

Moves to Thursday: every other skill, every plugin, the guards, the build
pipeline, the settings template, and the whole of `sync.sh` reborn as the
install engine.

## Cross-platform parity

Thursday targets Linux, macOS, and Windows. Neither source repository has any
continuous integration at all, and neither has meaningful platform-conditional
code: a repository-wide search finds exactly one branch, `tool-bash` disabled on
win32 in the aidos preset. Everything else assumes Linux by omission.

`skills/caffeine` shows how deep the assumption runs. It is not a Linux script;
it is a this-machine script. It calls `systemd-inhibit` and `kscreen-doctor`,
and it defaults `DBUS_SESSION_BUS_ADDRESS` and `WAYLAND_DISPLAY` to the values
one KDE Wayland session on one laptop happens to use. macOS wants `caffeinate`
and `pmset`; Windows wants `SetThreadExecutionState`. Promoting it to Thursday
means rewriting it against a capability interface, not copying it.

macOS cannot be containerized. There is no image, no emulator worth using, and
no cross-compilation path: Darling cannot run this stack. Real Apple hardware is
the only option, so the strategy splits in two. Make the platform differences
data, not branches: one `Platform` port owns every divergent surface, with a
real implementation per system and an in-memory fake. The fake then tests the
whole matrix on any machine on every commit, and real runners only have to prove
that the calls land.

The divergent surfaces, enumerated so the port has a fixed job:

```text
surface           Linux                    macOS                     Windows
Thursday home     ~/.thursday (XDG)        ~/.thursday               %LOCALAPPDATA%\Thursday
app entry         .desktop + hicolor       .app bundle + Info.plist  .lnk in Start Menu
icon format       png and svg              icns                      ico
launcher on PATH  ~/.local/bin             ~/.local/bin or brew      npm bin shim
default shell     bash 5                   zsh, and bash 3.2         no bash
sleep inhibit     systemd-inhibit          caffeinate -dis           SetThreadExecutionState
display blank     kscreen-doctor           pmset displaysleepnow     powercfg
bash-guard        applies                  applies                   no bash to guard
```

Two traps are already visible. macOS still ships bash 3.2, so the public
bootstrapper must be POSIX sh or bash-3.2-safe; `sync.sh` today uses `local -a`
arrays and `${#arr[@]}`, which do not survive that. And Windows has no bash at
all, which the guard model depends on, so the Windows stance is a product
decision and not an implementation detail. Ticket V4 settles it.

## Proposed monorepo structure

```text
thursday/
├── packages/
│   ├── aidos-kernel/   the domain kernel as a plain library (see A8)
│   ├── aidos-*/        the AIDOS plugins: core, tools, board, plan, scratch, guards
│   ├── cli/            the `thursday` binary: install, uninstall, sync, status
│   ├── install/        the install engine: block schema, ledger, planner, actions
│   ├── blocks/         one plugin block definition per Thursday component
│   ├── plugins/        one directory per DSH plugin fork or Thursday plugin
│   ├── build/          the shared esbuild pipeline for host and client halves
│   └── tokens/         the semantic design token system
├── profiles/
│   ├── thursday/       the full agent preset
│   └── quick/          the lightweight agent preset
├── config/             AGENTS.md, settings template, guards, host-plane patch
├── skills/             the migrated general skills, plus customize-thursday
├── wizards/            generated setup wizards (Cloudflare, domain, deploy, demo)
├── website/            the trythursday.org site
├── demo/               the containerized public demo
├── install/            install.sh, the small public bootstrapper
├── scripts/
└── PLAN.md
```

## How to work this plan

Every ticket is bounded so one agent can finish it without a second opinion.
Each body names what blocks it.

The migration is continuous, not one-shot. The user is still doing extensive
work in both `aidos` and `dotfiles-ai`, so those repositories stay authoritative
for their own work until the user decides otherwise. A one-shot migration would
be stale the day it landed and would turn every ported file into a merge
conflict against ongoing upstream work. Instead M1 makes the migration map
executable, N2 reports upstream drift routed through that map, and N3 turns each
batch of drift into bounded tickets on this board. Thursday's own thesis,
applied to its own migration.

Phase 10 is therefore gated on a decision, not on a date. Nothing is removed
from a source repository until the user explicitly calls the cutover, and until
Phase 9 proves Thursday reproduces the behavior.

Phase numbers are grouping, not execution order. Phase 0 is the v0.1 milestone —
the smallest thing a stranger can install and try — and most of it sits near the
END of the dependency graph, because installing Thursday requires the install
engine that Phase 5 builds. Read the blockers, not the phase number. An agent
that starts at the top of Phase 0 will find every ticket blocked.

What Phase 0 avoids is the code migration, not the whole plan. E5 installs AIDOS
from the package that exists today, E7 builds the installer against both source
repositories where they already live, and C4 generates the host-plane patch from
blocks whose sources may still point at `dotfiles-ai` checkouts. So no Phase 0
ticket waits for AIDOS to be decomposed or for the 24 plugin directories to move.
It does wait on one migration ticket by design: A6, the fs-sandbox decision,
because AIDOS scratch does not work without it and E6 cannot state its guarantee
until someone has decided whether the dsh tree gets patched.

The agreed priority order is bootstrap first (M0, R1, R3, R2), then the v0.1
milestone, then the import system (M1, N2, N3). R1 is deliberately unblocked so
that order is executable; it was blocked by M1, which put the ticket everything
else depends on behind the third group. The website track (D1, WS1, WS2, W1, WS5)
runs alongside, because nothing in it can be blocked by migration churn: W1 uses
the `wizard` skill where that skill already lives, so the claim holds literally
and not just in spirit. The Thursday look — TH1 to TH6 — hangs off D1 alongside
the website, because the tokens serve both and shipping a bundle that still looks
like stock dsh undersells it. Phase 12, the workspace surface, is outside all of
this and is not v0.1. The installation path page, WS4, waits for the install
engine:
a landing page that ships an install command which does not install anything is
worse than no landing page.

## Phase 0: v0.1 — the try-it bundle — `pending`

The milestone. A stranger installs Thursday, it does not touch anything they
already had, and they complete a real ticket in under ten minutes.

- [ ] **Ticket E1: The install wizard.** Installation ends in an interactive
  wizard, built with the `wizard` skill's template rather than a parallel
  framework, that configures the things Thursday cannot guess: the model
  provider and profile chains, the AIDOS durable scratch directory, and the AI
  scratch directory from E2. It must offer a free-provider path so a new user
  can finish setup and try Thursday without a paid account. It runs at the end
  of `thursday install`, is safe to rerun, and writes only inside the Thursday
  home. The AIDOS durable scratch directory defaults to `$THURSDAY_HOME/scratch`
  unless A6 relocates it, which is A6's decision to make and not this ticket's:
  read the default from wherever A6 records it rather than hardcoding the path
  twice. Blocked by C1, I4, A6.

  **Evaluate:**

  - the wizard configures provider, profile chains, and both scratch directories
  - a user with no paid account completes it and reaches a working session
  - rerunning it reports the existing configuration and changes nothing unasked
  - every path it writes is inside the Thursday home, verified by a test
- [ ] **Ticket E2: The AI scratch directory.** Thursday needs a working
  directory that belongs to the user, not to Thursday: the place a new user's
  first session opens, and where throwaway agent work lands. The wizard offers a
  name, suggesting `~/.ai-scratch` and `~/ai-scratch` and accepting anything,
  creates it, and records it as the default workspace. This is distinct from the
  AIDOS durable scratch directory, which is internal state. One is the user's
  desk, the other is the board's filing cabinet, and conflating them is how
  people lose work. Blocked by C1.

  **Evaluate:**

  - the wizard suggests the names, accepts a custom one, and creates the directory
  - an existing directory is adopted rather than overwritten
  - the first session opens in this directory
  - uninstall does not delete it, and says so
- [ ] **Ticket E3: Boot into the tour workspace.** Make the first launch after
  install open the Thursday preset, rooted in the seeded `trying-out-thursday/`
  workspace from E4, with `/teach-me-thursday` prefilled in the composer, so the
  user's only decision is whether to press enter. Two unknowns to settle first,
  and both are investigation before implementation: whether dsh can be told
  which workspace to boot into, and whether the composer can be prefilled. Check
  the `ui-onboarding` settings key that already exists in the settings template,
  and the slash-command registration used by `command-compact`, before writing
  anything new. Blocked by C2, C6, E4.

  **Evaluate:**

  - first launch opens the Thursday preset in the seeded workspace
  - the composer is prefilled and the user need only press enter
  - typing `/teach-me-thursday` in any later session starts the tour too
  - the second launch is a normal session with an empty composer
  - the findings on `ui-onboarding` and slash commands are recorded either way
  - if either mechanism turns out not to exist, the ticket closes on the recorded
    finding plus the nearest working substitute, rather than staying open forever
    on a capability dsh does not have
- [ ] **Ticket E4: The seeded tour workspace.** The tour is data, not machinery.
  The installer seeds a workspace directory `trying-out-thursday/` inside the E2
  AI scratch directory, holding a skill file with the tutorial script, a
  prefilled `PLAN.md` the user imports in their first minute, and enough toy
  source material to generate real context. The tour runs in chapters the user
  can stop after, because keeping the user in control applies to the tutorial
  too. Chapter 1 is the ticket lifecycle: the agent proposes, the user signs off,
  the agent works under the allowlist, evidence is attached, the user verifies
  and marks done. The user performs the human half themselves, because that is
  the part no explanation replaces. Chapter 2 shows the context tools, which are
  the most differentiated things in the stack and deserve demonstrating rather
  than describing: the agent does enough real work to build a substantial
  session, the user runs `/compact` and watches it shrink instantly and
  deterministically instead of waiting on a summarization model, then asks about
  something that was elided and the agent recovers it with `resume_search` and
  `resume_read`. The pair is what makes either one land. The seeded material
  exists precisely so chapter 2 has something to compact; an empty workspace has
  no context worth compacting and the demo falls flat. This ticket owns the only
  seeded tour in the plan: DM4 dresses this workspace for the public demo rather
  than authoring a second one. Blocked by E2, E5.

  **Evaluate:**

  - the workspace holds the tutorial skill, an importable `PLAN.md`, and toy source
  - a user who has never seen Thursday completes a full ticket lifecycle unaided
  - the user personally performs signoff, verify, and mark-done
  - chapter 2 produces a visible token drop from `/compact` on a real session
  - the user asks for something elided and the agent recovers it with resume
  - every instruction names the exact control to click
  - the user can stop after chapter 1, and the tour says so
  - the tour works on a clean install with a free provider and no other repository
- [ ] **Ticket E5: Ship v0.1 on the existing aidos package.** The try-it bundle
  does not have to wait for the migration. For v0.1 the install engine installs
  AIDOS from the pinned `aidos` package that exists today, exactly as `sync.sh`
  does. The block records the source as a pinned spec, which is already how the
  third-party roster works, so swapping it for the migrated workspace packages
  later is a one-line block change and not a rewrite. Record the swap criteria
  so v0.1 does not quietly become permanent. Blocked by I2.

  **Evaluate:**

  - the AIDOS block installs the pinned upstream package and the board works
  - swapping the block to workspace packages is a source change with no other edit
  - the ticket names what must be true before the swap happens
  - nothing in the v0.1 bundle depends on the decomposition being finished
- [ ] **Ticket E6: The no-side-effects guarantee.** The promise the bundle is
  sold on: installing Thursday must not break, change, or interact with an
  existing dsh installation. This ticket proves it rather than asserting it.
  Checksum the real dsh home, the shipped dsh package tree, and the shell
  profile files before install; install, run both presets, run the tour,
  uninstall; checksum again and require byte equality. Today's `sync.sh` fails
  this test by design, because it edits the shipped `standard` preset in place,
  so this is a genuine behavioral departure. This ticket owns the byte-identity
  assertion for the whole plan on the development platform; C6, I7 and T2 refer
  to it rather than restating it, and T2 is what extends it to macOS and Windows.
  I7 states its own reversal criteria in terms of the ledger and does not refer
  forward to this check, because a mutual reference between the two would
  deadlock. The criteria below run both presets and the tour, so C6 and E4 are
  blockers and not assumptions. Blocked by I7, E1, C6, E4, A6.

  **Evaluate:**

  - the dsh home, package tree, and shell profiles are byte-identical before and after
  - the test covers install, both presets, the tour, and uninstall
  - no file outside the Thursday home and the AI scratch directory is created
  - the test runs in CI on every change to the install engine
- [ ] **Ticket E7: Installer parity first, sources unmoved.** Build the
  installer now against `aidos` and `dotfiles-ai` where they already live, and
  replace the steps incrementally. The engine's first job is parity with
  `sync.sh` — same artifacts, same pins, same resulting composition — but in
  TypeScript, block-driven, reversible, and pointed at a dedicated Thursday home
  instead of the user's dsh tree. Each block's source starts as a pinned spec or
  a local checkout path and is repointed to a workspace package as the migration
  delivers it. This is what lets the user develop Thursday inside Thursday
  shortly after the milestone. The three in-place patches to the shipped
  `standard` preset are deliberately NOT reproduced. Blocked by I1, C1.

  **Evaluate:**

  - the engine produces a composition equivalent to a `sync.sh` run, artifact by artifact
  - every difference from `sync.sh` is deliberate and named
  - a block's source can be a pin or a local checkout, and repointing changes nothing else
  - the user completes at least one ticket on this board from inside Thursday,
    end to end, without falling back to the old bundle
- [ ] **Ticket E8: The Thursday container image.** One image, built in this
  repository, that installs Thursday with the real installer and serves dsh web.
  It is the substrate for local dogfooding now and the public demo later, so the
  demo never becomes a second implementation. Two modes matter: ephemeral, which
  proves a clean install every run, and persistent, which keeps the Thursday
  home in a named volume. The image runs as a non-root user whose UID matches
  the host, or a bind-mounted scratch directory fills with root-owned files.
  Blocked by I4, E1.

  **Evaluate:**

  - the image builds from the repository with no manual step
  - an ephemeral run reaches a working session in a host browser
  - a persistent run keeps the Thursday home and the board across a restart
  - files created in a bind-mounted directory are owned by the host user
  - no credential appears in any image layer
- [ ] **Ticket E9: The personal test harness.** The user's own run configuration
  for E8: the compose file or run script that mounts their scratch directory,
  publishes the web port, and supplies credentials from the environment. This is
  personal configuration and does NOT live in this repository; it belongs in
  `dotfiles-ai`. Recorded here only so the boundary stays deliberate: the image
  is the product, the mount and the keys are the user's. On Linux
  `--network host` avoids two problems at once, because dsh binding loopback
  inside a container cannot be reached by published ports, and reaching it from
  outside loopback makes settings RPCs inert unless dsh-remote is configured.
  Blocked by E8.

  **Evaluate:**

  - the harness lives in `dotfiles-ai`, not in this repository
  - the scratch directory is visible inside the container and writable as the host user
  - the user reaches a working Thursday session in a browser from one command
  - settings panels are live, not inert, in that browser session
- [ ] **Ticket TH1: The Thursday skin.** A client plugin that makes the dsh web
  UI look like Thursday, driven entirely by the D1 tokens so no color is written
  twice. Surfaces go black and very dark neutral gray; `#101010`, `#202020` and
  `#303030` are the requested direction, offered to D1 as input rather than fixed
  here, because D1 derives the palette from shcmonokai and the user approves it,
  and a ticket that hardcodes three greys pre-empts that review. Panels are
  distinguished by elevation rather than by borders alone. Radii shrink until the
  UI reads square, close to Zed and far from a consumer app. Buttons, chips,
  inputs, focus rings, and state colors
  all resolve to tokens. It overrides dsh's own theme variables from a
  higher-specificity root selector, the way the existing `system-fonts` plugin
  already overrides the font tokens, rather than forking the theme package. It
  ships in the Thursday home only and is reversed by uninstall like any other
  block. Blocked by D1, I2.

  **Evaluate:**

  - no color literal appears in this plugin's stylesheets; every value is a token.
    The rule is scoped to the skin, because `assets/` holds the brand mark and its
    own colors and the tokens package holds the definitions
  - adjacent panel surfaces differ by a stated minimum luminance step, and the
    step is recorded so a later change cannot flatten them by accident
  - no control — button, input, chip, tab — exceeds D1's control radius, which is
    at most 4px, except where a control is a circle by design. Containers use the
    separate container radius, which D1 defines and explains
  - focus states are visible on every interactive control, by keyboard alone
  - the user's normal dsh install is visually unchanged
  - uninstall removes the skin with no residue
- [ ] **Ticket TH2: The mark, the favicon, and the animated logo.** Put the
  Thursday mark everywhere the dolphin currently is. `assets/thursday-logo.svg`
  is the source: a segmented cross whose gradient drifts between `#0a5cff` and
  `#ff8400` on a 14-second loop. Use the animated SVG in the UI where the dolphin
  sits, and derive the favicon from the same source. The animation must degrade
  honestly: a static frame under `prefers-reduced-motion`, and a flat fallback
  wherever an animated SVG cannot be used, such as the favicon at small sizes and
  the `.ico` and `.icns` exports. Check the mark at 16px before committing to it,
  because the kerfs between the segments are the first thing to disappear.
  Blocked by B2, TH1.

  **Evaluate:**

  - the Thursday mark replaces the dolphin in the web UI
  - the favicon is the Thursday mark and meets B2's 16px legibility rule, which is
    where that rule is defined; B2 cuts the raster and `.ico` exports and this
    ticket wires them up rather than cutting a second set
  - `prefers-reduced-motion` yields a static mark
  - the animated and static forms come from one committed vector source
  - the user's normal dsh install still shows its own branding
- [ ] **Ticket TH3: The thinking phrases.** Replace the "Deep diving..." working
  indicator with a rotating set of phrases in Thursday's voice, a small animated
  Thursday mark to their left, and the gradient recolored from dsh's
  white-to-blue to Thursday's blue-to-orange. Write the phrase set rather than
  importing one: the well-known lists trace back to SimCity 2000's "Reticulating
  splines" and the scraped collections on GitHub are unlicensed, inconsistent in
  tone, and full of references that will not age. A curated set of our own keeps
  one voice and avoids the licensing question entirely. Keep each phrase short
  enough not to reflow the line, funny on the second reading rather than only the
  first, and never implying a specific operation that is not happening. Blocked
  by TH1, TH2.

  **Evaluate:**

  - every phrase is original to Thursday: each one is searched for verbatim before
    it ships, and a phrase found in an existing published list is replaced
  - no phrase exceeds 32 characters, so the indicator line does not reflow at the
    narrowest supported width
  - the rotation interval is at least 2.5 seconds and no phrase repeats until the
    set has been exhausted
  - the gradient runs from the brand-blue token to the brand-orange token that D1
    defines, with no literal
  - no phrase names a tool, a file, a model, or an operation, so none of them can
    claim something that is not running
  - a small animated mark sits to the left, and it honors `prefers-reduced-motion`
  - the phrase set is a data file, so adding one needs no code change
- [ ] **Ticket TH4: Thursday typography and bundled fonts.** Replace the DeepSeek
  Harness logo in the top left with the word "Thursday" set in a serif face,
  Literata as the intended choice, so the application reads as Thursday before
  anything else loads. Bundle the fonts rather than linking them: a browser on
  another machine, a container, and an offline install must all render the same,
  and a webfont fetched from a third party is both a privacy leak and a failure
  mode. Ship Literata for the wordmark, Inter as the UI fallback, and Fantasque
  Sans Mono as the monospace fallback, each self-hosted from the Thursday assets
  with a `@font-face` and a local-font-first stack, so a user who has the font
  installed uses theirs and everyone else still gets the right shape. All three
  are SIL Open Font License, so bundling is permitted, and the license files ship
  with them. The existing `system-fonts` plugin is the prior art: it already
  overrides dsh's hardcoded `:root` font tokens from `html:root`, which outranks
  them without `!important`, and dsh's monospace stack notably ends at a named
  font with no `monospace` generic. Use that technique rather than inventing a
  second one; this does not require the plugin itself to have moved, so P2 is not
  a blocker. The top-left wordmark here is live text, not B2's wordmark asset:
  B2's asset is for the desktop entry, the manifest and the website, and this one
  must be selectable, scalable and themable, so the two are deliberately different
  artifacts and the ticket says which is which. Blocked by TH1, B2.

  **Evaluate:**

  - the top-left mark reads "Thursday" as live text in a serif face, with no dsh
    logo, and it is selectable and scales with the UI
  - every bundled font is served from Thursday's own assets, with no third-party
    request at runtime, verified with the network panel offline
  - each font stack tries the locally installed font first, then the bundled copy
  - the monospace stack ends in the `monospace` generic, so a missing font cannot
    fall through to a proportional face
  - the SIL OFL license file for each bundled family ships beside it
  - text renders in the intended faces with the network disabled
- [ ] **Ticket TH5: Rework the top bar.** Three changes to the session header,
  done together because they all move the same row and three agents editing it
  separately would collide. Center the tabs and style them as badges rather than
  as underlined text. Move the download-session-log button out of wherever it
  sits now and put it immediately to the right of the session title as an icon
  button, so it reads as an action on that session instead of a stray global
  control. Put the preset name to the left of the session title as a badge, so
  Thursday versus Quick is visible at a glance and the header answers "which mode
  am I in" without a click. The title row therefore reads: preset badge, title,
  log icon. An icon-only control loses its label, so it carries an accessible
  name and a tooltip; without them the affordance is discoverable only by
  guessing. All three take
  their shape from the TH1 tokens: badge fill, radius, and border are token
  values, not literals, and the preset badge must be distinguishable from a tab
  badge rather than looking like a fourth tab. This is a different and more
  invasive kind of change than TH1: TH1 only overrides theme variables from a
  higher-specificity selector, which upstream cannot break, whereas moving
  controls means either registering into a slot dsh already offers or replacing
  the header component outright. Establish which of the two is possible before
  writing the UI, because the second option couples Thursday to dsh's internal
  layout and will break on upgrade. Query the client Slot tree for the header
  region first and record what it offers either way. Blocked by TH1.

  **Evaluate:**

  - the tabs are horizontally centered in the bar and render as badges, not
    underlined text
  - each of the three tabs carries an icon, and the tab reading "Trajectory" is
    relabelled "Session log"
  - the relabel is cosmetic only: no event name, projection, route, or stored
    value is renamed with it
  - the download-session-log control is an icon button immediately right of the
    session title, and downloads that session's log
  - the icon button has an accessible name and a tooltip, and is reachable and
    operable by keyboard
  - the preset name renders as a badge to the left of the session title, and reads
    Thursday or Quick correctly in each preset
  - the preset badge is visually distinct from a tab badge and cannot be mistaken
    for one
  - every fill, radius, and border in the bar resolves to a TH1 token, with no
    literal
  - the bar keeps working at a narrow width: nothing overlaps and nothing is clipped
  - the header findings are recorded: which slots dsh offers, and whether the
    change is a slot registration or a component replacement
  - the user's normal dsh install has an unmodified top bar
- [ ] **Ticket TH6: Raw request and response inspection in the session log.** Let
  a session-log entry be opened to show the raw HTTP request and response pair
  behind it, so a user can see exactly what was sent and returned rather than the
  harness's rendering of it. This is the highest-value debugging surface in the
  product and the one thing no amount of prose about token efficiency can
  substitute for: it is how a user learns what their tokens actually bought.
  Establish first whether dsh retains the wire pair at all, because the trajectory
  is built from normalized events and a normalized event is not a request; if the
  pair is not retained, the first deliverable is the host-side capture that
  retains it, bounded so it cannot grow without limit. Redaction is not optional
  and not a later ticket: a raw request carries the Authorization header and
  therefore the user's API key, and TH5 puts a one-click download of the whole
  session log in the header, so an unredacted pair turns a debugging feature into
  a credential leak the moment someone shares a log to ask for help. Redact on
  capture, never on display, so the secret never reaches disk. Bodies can be very
  large, so render progressively rather than dumping them into the DOM. Blocked
  by TH1, TH5.

  **Evaluate:**

  - a session-log entry opens to show its request and response pair, with headers
    and body
  - whether dsh retains the wire pair is established and recorded, and if it does
    not, the capture that retains it ships with this ticket
  - every credential-bearing header is redacted at capture, so no unredacted
    secret is ever written to disk
  - a downloaded session log contains no API key, verified by searching the export
    for the configured key
  - a multi-megabyte body opens without freezing the UI
  - retention is bounded, and the bound is stated and enforced
  - turning the capture off is possible and documented, and the feature degrades
    to today's behavior
- [ ] **Ticket TH7: Sidebar workspace items as panels.** The sidebar's workspace
  list reads as a wall of text because nothing separates one item from the next.
  Give each item the card treatment the tool-call cards already use, so the eye
  can find an item's edges. The existing rule, from
  `tool-render/src/client.module.css`, is a 1px `--dsw-alias-border-l2` border, a
  `0.75rem` radius, a `--dsw-alias-bg-layer-1` background, `0.3125rem 0.5rem`
  padding, and a border-color lift to `--dsw-alias-border-l3` on hover. Port those
  values into the D1 tokens rather than copying the dsh alias variables through,
  so Thursday's sidebar and Thursday's tool cards stay in step by construction.
  Note the conflict this resolves: TH1 says the UI reads square with no radius
  above 4px, and this card is 12px, so one rule cannot cover both. The resolution
  is two radius tokens, not a winner — a container radius for panels and cards,
  and a control radius for buttons, inputs, chips and tabs. That is what Zed
  actually does, and it keeps the interface square where a user's hands are while
  still letting a panel have edges. Both tokens are D1's to define, and TH1's
  criterion is written against the control radius. Density matters more than
  decoration here: a card that adds vertical padding to every row turns a
  scannable list into a scrolling one, so keep the padding as tight as the tool
  card's. Blocked by TH1, D1.

  **Evaluate:**

  - each sidebar workspace item renders as a bordered, rounded panel with a
    distinct background from the sidebar behind it
  - the border, radius, background, and hover treatment all resolve to D1 tokens,
    with no dsh alias variable and no literal
  - the item uses the container radius token and the value matches the tool-call
    card, so the two read as the same component family
  - the number of items visible without scrolling drops by no more than one
    against the current list
  - hover and keyboard focus are both visibly distinct from rest, and from each other
  - the tool-call cards and the sidebar items stay in step: changing the container
    token moves both

## Phase 1: Foundation — `pending`

- [x] **Ticket M0: Land PLAN.md and the repository shell.** Write this plan to
  the repository root and give the fresh repository the minimum shell it needs
  to be worked in: a README naming Thursday and its goals, a `.gitignore`, and a
  `docs/` directory. The plan document and the board are the same work in two
  places, and this is where they first agree.

  **Evaluate:**

  - `PLAN.md` exists at the repository root and matches the board
  - the plan parses under the real AIDOS parser, run from the aidos checkout at
    `~/repos/aidos/skills/aidos-plan/verify-plan.mjs`, which is where that script
    lives until A5 moves it into this repository
  - the README names Thursday, the four product goals, and the two presets
  - `git status` is clean after the commit
- [ ] **Ticket M1: The executable migration map.** Both source repositories stay
  under active development while Thursday is built, so the migration is
  continuous, not one-shot. The map is therefore a machine-readable artifact,
  not just prose: a checked-in table of source path patterns to Thursday
  destinations, each with a verdict of move, stay, or drop, and a reason.
  `docs/MIGRATION-MAP.md` is generated from it so the human-readable version
  cannot drift. N2 consumes it to route upstream changes to the packages they
  affect. Blocks A1, P1, P2, P4, P5, S2, C1 and N2, each of which names it back;
  everything else that needs it inherits it through one of those.

  **Evaluate:**

  - every path in both repositories matches exactly one rule, with no remainder
  - a file added upstream that matches no rule is reported as an error
  - each of the 38 skills and each of the 24 plugin directories has a verdict
  - `docs/MIGRATION-MAP.md` is generated, and a stale copy fails the check

- [ ] **Ticket R1: Create the monorepo skeleton.** Set up the pnpm workspace,
  the root `package.json`, `pnpm-workspace.yaml`, the base `tsconfig.json`, the
  prettier config, and the vitest config, using the two source repositories'
  configs as the starting point rather than inventing new ones. Create the empty
  package directories from the structure above with a one-line README each. This
  is deliberately not blocked by M1: the skeleton is the workspace plumbing and
  the directory shape, both of which the structure section above already fixes,
  and gating it on the map would put the ticket every other ticket depends on
  behind the migration. M1 refines the package list later; adding a directory is
  cheap. Blocked by nothing.

  **Evaluate:**

  - `pnpm install` succeeds from a clean clone
  - `pnpm typecheck` and `pnpm test` both run and pass with zero packages
  - the workspace globs match every directory under `packages/`

- [ ] **Ticket R2: Extract the shared build pipeline.** Move `build.mjs` from
  dotfiles-ai into `packages/build` as a reusable module: host-half bundling
  (node, esm, `@deepseek-ai/*` and `node:*` external) and client-half bundling
  (browser cjs wrapped in the module-loader facade, or plain IIFE where no npm
  dependency is inlined). Each plugin package declares its own entries; the
  pipeline reads them. Keep the `--check` drift mode. Blocked by R1.

  **Evaluate:**

  - one command builds every plugin package in the workspace
  - the drift check fails when a committed bundle differs from a fresh build
  - the `createRequire` banner survives for the mcp-servers host half

- [ ] **Ticket R3: Root developer tooling and scripts.** Wire the root scripts
  the rest of the plan calls: `build`, `typecheck`, `test`, `format`, `lint`,
  and `check` (all of them, in order). Add the git ignore rules for build
  output and local state. Blocked by R1.

  **Evaluate:**

  - `pnpm check` runs format, typecheck, build drift, and tests in one pass
  - a deliberately broken type fails `pnpm check` with a readable error

- [ ] **Ticket D1: The semantic design token system.** Create `packages/tokens`
  exporting the token set as CSS custom properties and as a typed TypeScript
  object: background, background-elevated, background-surface, foreground,
  foreground-muted, border, accent, accent-muted, success, warning, error, info,
  selection, focus, code, plus brand-blue and brand-orange, which are the two
  endpoint colors of `assets/thursday-logo.svg` and which TH3's gradient and the
  website both need by name. Two radius tokens as well, not one: a control radius
  of at most 4px for buttons, inputs, chips and tabs, and a container radius for
  panels and cards, which the existing tool-call card sets at `0.75rem`. One
  radius cannot serve both, and TH7 explains why. Derive the color values from
  the `xyzshantaram/shcmonokai`
  VS Code theme, with Zed's surface treatment as the secondary reference. No
  hard-coded hex outside this package. Blocked by R1.

  **Evaluate:**

  - every token has a value and a one-line comment naming its intended use
  - the contrast ratio of foreground on background is at least 7:1
  - the package exports both a `.css` file and a typed object from one source
- [ ] **Ticket V1: The platform port.** Define one `Platform` port in
  `packages/install` that owns every OS-divergent surface, with a real
  implementation per system and an in-memory fake. The surfaces are the ones
  tabled above. No block, command, or skill may branch on `process.platform`
  directly; they ask the port. This exists so the whole platform matrix is
  testable on any one machine, and real macOS and Windows runners only have to
  prove the calls land. Blocked by R1. Blocks I1.

  **Evaluate:**

  - a repository-wide search finds no `process.platform` branch outside the port
  - the fake implementation drives every surface in a unit test on Linux
  - each real implementation is exercised by at least one test on its own OS
  - adding a surface is one interface change and three implementations
- [ ] **Ticket V2: Continuous integration and the platform matrix.** Neither
  source repository has any CI: there is no `.github` directory in either one.
  Stand it up on GitHub Actions with a three-way matrix — `ubuntu-latest`,
  `macos-15` on arm64, and the Windows target V4 settles — running build,
  typecheck, bundle-drift check, and the unit suite on every push. macOS runners
  are free for public repositories and carry a 10x minute multiplier for private
  ones, so keep expensive jobs off the pull-request path. Blocked by R3.

  **Evaluate:**

  - the matrix runs build, typecheck, drift check, and tests on all three systems
  - a failure on one system does not cancel the other legs
  - the macOS leg runs on arm64
  - total pull-request CI time stays under ten minutes
- [ ] **Ticket N2: Upstream drift tracking.** Record, per source repository, the
  upstream commit Thursday is current with. Ship `thursday upstream status`,
  which fetches both repositories, diffs from the recorded commit to the current
  head, routes every changed path through the M1 map, and reports what changed
  grouped by the Thursday package it affects, plus anything that matched no rule.
  It reports; it does not merge. A bad automatic merge into a repository that has
  been restructured into packages is worse than no automation. Blocked by M1, R1.

  **Evaluate:**

  - the recorded upstream commits are checked in and updated by an explicit command
  - status groups upstream commits by the Thursday package they touch
  - a path matching no map rule is reported loudly as unclassified
  - running status twice with no upstream movement reports nothing to do
- [ ] **Ticket N3: Drift becomes bounded tickets.** Turn the N2 report into work
  the board can carry: `thursday upstream import` creates one AIDOS ticket per
  affected Thursday package, carrying the upstream commit range, the changed
  paths, and the patch to review. This is the mechanism that lets the user keep
  working in `aidos` and `dotfiles-ai` without Thursday falling behind, and it is
  Thursday's own thesis applied to its own migration. Blocked by N2.

  **Evaluate:**

  - one upstream batch produces one ticket per affected package, not one per commit
  - each generated ticket names the commit range and the exact files to port
  - re-running import after a ticket is done does not recreate it
  - the recorded upstream commit advances only when its tickets are closed

## Phase 2: The AIDOS subsystem — `pending`

- [ ] **Ticket A8: Decompose AIDOS into plugin boundaries.** AIDOS ships today
  as one package that already spans three planes: the `aidos-core` host service,
  the agent-plane tool rows, and the client board UI. Turn that implicit seam
  into real plugin boundaries so AIDOS is composed the way any other Thursday
  plugin is, and so a preset can take the parts it needs. The proposed split:
  `aidos-kernel` as a plain library, since two plugins must not each own the
  state; then `aidos-core`, `aidos-tools`, `aidos-board`, `aidos-plan`,
  `aidos-scratch`, and `aidos-guards`. Write the boundaries and their service
  contracts up in `docs/aidos-decomposition.md` before moving any code. Do not
  over-split: the kernel invariants must stay in exactly one place. This is the
  approval gate for the decomposition, so A1 names it as a blocker and A2, A3 and
  A4 inherit it through A1: no AIDOS code moves before the boundaries are
  approved. Blocked by M1. Blocks A1.

  **Evaluate:**

  - the document names each plugin, what it owns, and what it depends on
  - exactly one component owns ticket state, and the document says which
  - every boundary names at least one composition in this plan that uses it, and
    a boundary no composition uses is merged away before the document is approved
  - Quick's useful subset is named explicitly, and it excludes the board
- [ ] **Ticket A1: Move the AIDOS kernel and host.** Move `src/kernel/` and
  `src/host/` into `packages/aidos`, keeping module names and the `aidos`
  package name so existing identifiers do not churn. Keep the `cordis.patch.yml`
  contract: `aidos-invariants` before `aidos-core`. Blocked by R1, R2, M1, A8.

  **Evaluate:**

  - `packages/aidos` typechecks with no reference to the old repository
  - the mounted bundle patch still orders invariants before core

- [ ] **Ticket A2: Move the AIDOS board UI.** Move `src/client/` into
  `packages/aidos/src/client`, including the vendored highlight module and the
  CSS modules. Do not restyle anything yet; the token migration is D2. Blocked
  by A1.

  **Evaluate:**

  - the client half builds through the shared pipeline from R2
  - the board renders in a live session with tickets, detail panel, and queue

- [ ] **Ticket A3: Move the AIDOS tools and guards.** Move `src/tools/` and
  `src/plan/`: the board tools, the state-gated mask, the delegation-depth
  guard, the per-ticket allowlist, the scratch tools, the bash-ask listener, and
  `parsePlan`. Delete the stale `aidos-tools.ts.backup`. Blocked by A1.

  **Evaluate:**

  - every board tool is registered in a live Thursday session
  - the mask still hides write tools while a ticket is `open`
  - `aidos-tools.ts.backup` is gone

- [ ] **Ticket A4: Port the AIDOS test suite.** Move all ~90 vitest files into
  `packages/aidos/tests`, update imports, and keep the PORT-MAP notes. Blocked
  by A1, A2, A3.

  **Evaluate:**

  - `pnpm --filter aidos test` passes with no skipped files
  - the test count matches the source repository's, or each drop is justified in
    the ticket comments

- [ ] **Ticket A5: Move the AIDOS skills.** Move `skills/aidos-plan/` into the
  monorepo `skills/` tree, including `PLAN_IMPORT_TEMPLATE.md` and
  `verify-plan.mjs`. Point the verifier's repo mode at the new
  `packages/aidos/src/plan/plan.ts`. Blocked by A3.

  **Evaluate:**

  - `node skills/aidos-plan/verify-plan.mjs PLAN.md` exits 0 in repo mode
  - the verifier's mirror mode still works when the skill is copied alone

- [ ] **Ticket A6: Settle the dsh fs-sandbox patch.** Decide and implement one
  of: keep patching the dsh tree from the install engine, move the AIDOS scratch
  root under a path the sandbox already allows, or upstream the exemption.
  Record the decision and its reason in `docs/`. A patch, if kept, must be
  applied by the install engine and reversed by uninstall. This decision gates
  v0.1 and not only the migration: E5 ships the AIDOS scratch tools, which do not
  work without the exemption, and E6 promises the dsh package tree is untouched.
  Option one honors E6's checksum, because the patch is reversed at uninstall,
  but not its stated meaning, because Thursday would mutate the shared dsh tree
  for as long as it is installed. Say plainly which is being chosen. It does not
  depend on the AIDOS code having moved, only on the home layout. Blocked by C1.

  **Evaluate:**

  - a scratch write succeeds in a fresh Thursday install with no manual step
  - the decision document names the alternatives and why they lost
  - the document states, in one sentence, whether the shared dsh package tree is
    modified while Thursday is installed. That sentence is the wording every
    downstream guarantee and the website must reuse verbatim
  - if a patch is kept, uninstall restores the original file byte for byte

- [ ] **Ticket A7: AIDOS mounts from the monorepo.** Make the migrated package
  installable and mountable without the old GitHub pin: the install engine
  installs it from the workspace or a published artifact, and the preset
  resolves `aidos-tools.js` without the `aidos-loader.js` shim that `sync.sh`
  generates. Blocked by A1, A3, C2.

  **Evaluate:**

  - a fresh install mounts AIDOS with no `github:xyzshantaram/aidos` spec anywhere
  - no generated loader shim exists in the Thursday DSH home

- [ ] **Ticket D2: Move the board UI onto the design tokens.** Replace the
  hard-coded colors in the AIDOS board CSS with the tokens from D1. Keep the
  dense, high-contrast, editor-like feel; do not redesign the layout. Blocked by
  A2, D1.

  **Evaluate:**

  - no hex color literal remains in `packages/aidos/src/client`
  - every token the board now reads resolves to a value, with no fallback silently
    painting an element, checked by rendering the board with the token sheet absent
  - the layout is unchanged: no element moves, resizes, or changes typeface
- [ ] **Ticket A9: The gate-integrity contract.** Splitting AIDOS into plugins
  creates a way to break it that does not exist today: a preset that mounts
  `aidos-tools` without `aidos-guards` gets the board with none of the state
  gating, which is the whole reason AIDOS exists. The agent could then write
  files with no signoff while the board still displays a lifecycle that is no
  longer enforced. Make that impossible by accident. Declare which plugins are
  load-bearing for the guarantee, have `aidos-core` refuse to serve tools when
  its required companions are absent, and make `thursday status` report a
  composition that has been hollowed out. Blocked by A8, A3.

  **Evaluate:**

  - a composition with the tools and without the guards fails at mount, naming what is missing
  - the refusal message explains what guarantee would have been lost
  - a test asserts the refusal, so a future refactor cannot quietly remove it
  - `thursday status` flags a composition missing a load-bearing plugin

## Phase 3: DSH plugin forks — `pending`

- [ ] **Ticket P1: Move the host-plane plugins.** Move the eleven single-file
  host plugins into `packages/plugins/<name>/`, each with its own
  `package.json`, source, and build entry: bash-guard, manifest-guard,
  package-tool, skill-gate, see, tmp-dsh-shared, grant, ask-interrupt, profiles,
  resume, log-exporter. Carry their tests. Blocked by R2, M1.

  **Evaluate:**

  - each plugin builds to a self-contained ESM bundle through the R2 pipeline
  - `pnpm test` runs every ported plugin test and passes
  - the bash-guard tests still cover translate, sandbox drift, and planning rules

- [ ] **Ticket P2: Move the client plugin packages.** Move the eleven complete
  client packages with their `cordis.patch.yml`, CSS modules, and tests:
  approval-comment, composer-menu, context-meter, durable-todos, log-viewer,
  mcp-servers, profiles-client, session-archive, subscriptions, system-fonts,
  tool-render. job-viewer is deliberately excluded: it has no `package.json` and
  no bundle patch, so it cannot satisfy the mount criterion below. P4 owns moving
  it and completing it in one step. Blocked by R2, M1.

  **Evaluate:**

  - every package builds both halves through the R2 pipeline
  - each package's bundle patch mounts without a duplicate loader entry id
  - the ported tests pass

- [ ] **Ticket P3: Move the vendored llm-pi-ai fork.** Move
  `plugins/llm-pi-ai/` into the monorepo, keep the override that disables the
  builtin row, and record why the fork exists in the package README. Blocked by
  P2.

  **Evaluate:**

  - only one pi-ai adapter registrar is active in a live session
  - the README names the upstream version the fork is based on

- [ ] **Ticket P4: Move and finish the job-viewer plugin.** The buffer and poller
  exist; the package does not. Move `plugins/job-viewer/src/` into the monorepo
  and add what is missing: `package.json`, the host and client halves, the bundle
  patch, and the panel that shows a background job's output. P2 excludes this
  package for exactly this reason, so the move and the completion happen here in
  one step. Blocked by R2, M1.

  **Evaluate:**

  - a running background job's output appears live in the panel
  - the panel survives a page reload and shows a finished job's final output
  - the buffer and poller tests still pass

- [ ] **Ticket P5: Turn the third-party roster into data.** Replace the
  hard-coded `pnpm_ins` calls with a declarative roster file: package name,
  spec, pin, why it is installed, and whether it needs a pnpm `allowBuilds`
  entry. The install engine reads it. Blocked by M1.

  **Evaluate:**

  - the roster reproduces every spec `sync.sh` installs, with the same pins
  - each entry carries a one-line reason
  - the alias entry for the compaction fork is represented without special-casing

- [ ] **Ticket P6: Move the bash-guard rule drop-ins.** Move `guards/*.json`,
  including the per-phase profile rules, into `config/guards/`. Blocked by P1.

  **Evaluate:**

  - a Thursday session denies `grep` and returns the exact `rg` replacement
  - the planning-phase read-only rules still fire in the planning phase

- [ ] **Ticket P7: Document each plugin's effects.** Give every plugin package a
  README section answering the five questions the brief names: what it changes,
  where, why it is installed, how to disable it, how to remove it. Blocked by
  I1. Deliberately not blocked by P1 and P2: a block's source may be a local
  checkout in `dotfiles-ai`, exactly as E7 requires, so generating the patch does
  not wait for 22 packages to move. Repointing a source at a workspace package as
  P1 and P2 land changes the block, not this generator.

  **Evaluate:**

  - every package under `packages/plugins` has all five answers
  - a script fails when a package is missing the section

## Phase 4: Composition, profiles, and the dedicated DSH home — `pending`

- [ ] **Ticket C1: Design the Thursday DSH home layout.** Decide where
  `THURSDAY_HOME` lives, how it maps to `DSH_HOME`, where presets, skills,
  guards, the profile patch, and the install ledger sit inside it, and how a
  Thursday session finds them. Write it up in `docs/dsh-home.md`. The layout
  must let both presets live in one home. Blocked by M1.

  **Evaluate:**

  - the document names every path Thursday writes and who owns it
  - nothing in the layout points into the user's normal `~/.dsh`
  - the document explains how the launcher sets the environment

- [ ] **Ticket C2: The Thursday agent preset.** Build
  `profiles/thursday/agent.cordis.yml` from the aidos preset: shell, fs, jobs,
  skills, web, ask-user, todo, the delegation group, and the AIDOS tools row
  last. Everything on, AIDOS included. For v0.1 the AIDOS row resolves to the
  pinned package E5 installs, so this preset does not wait on the decomposition;
  A3 repoints the row at the workspace packages later without touching the rest
  of the composition. Blocked by C1, E5.

  **Evaluate:**

  - a Thursday session exposes the board tools and the delegation tools
  - `tool-bash` is disabled in favor of the guard-registered `bash`
  - the preset mounts with no duplicate tool registration

- [ ] **Ticket C3: The Quick agent preset.** Build `profiles/quick/` as the same
  composition minus the AIDOS rows and the ticket-state tool masking: the same
  plugins, guards, skills, and model routing, with no board and no signoff gate.
  Blocked by C2.

  **Evaluate:**

  - a Quick session can edit a file and run a command with no ticket
  - no board tool is registered in a Quick session
  - the two presets share their rows from one source, with no copied duplicate

- [ ] **Ticket C4: The host-plane composition as data.** Replace the heredoc in
  `step_write_web_patch` with a generated `cordis.patch.yml` built from the
  plugin blocks, so adding a plugin is a block change and not a shell edit.
  Blocked by P1, P2, I1.

  **Evaluate:**

  - the generated patch mounts every host-plane row `sync.sh` mounted
  - the top-level override rows (`llm-pi-ai`, `command-compact`, `remote`) keep
    their placement, and boot does not fail on a duplicate id
  - adding a plugin block adds its row with no hand-written YAML

- [ ] **Ticket C5: The settings template and the agent rules file.** Move
  `home/settings.yaml` into `config/`, strip the personal accounts and model
  routes into an overlay the user supplies, and keep the profile chain structure.
  Preserve the byte-level care the old script took: no full YAML round-trip,
  because YAML 1.1 mangles the `off:` key. Move `home/AGENTS.md` here too and
  install it the same way. It is listed in the structure section and in the
  `sync.sh` effects the engine must reproduce, and no other ticket in any phase
  claims it, so without this it is silently dropped and every session loses the
  rules file. Blocked by C1.

  **Evaluate:**

  - `AGENTS.md` is installed into the Thursday home and a session reads it

  - a fresh install writes a settings file with no personal account names
  - `profile.active` survives a re-sync
  - the `reasoningEfforts` `off:` key survives a re-sync unmangled

- [ ] **Ticket C6: The Thursday launcher.** Ship the `thursday` command that
  boots dsh against the Thursday home, with `thursday quick` selecting the Quick
  preset for the next session. It must not touch the user's normal dsh state.
  Blocked by C1, C2, C3.

  **Evaluate:**

  - `thursday` opens the web UI with the Thursday preset available
  - `thursday quick` opens a session in the Quick preset
  - neither command opens, reads, or writes any path outside the Thursday home,
    checked by tracing the launcher's filesystem calls. The end-to-end byte
    identity of the user's dsh home is asserted once, downstream, and is not
    restated here

## Phase 5: Plugin blocks, installation, and reversal — `pending`

- [ ] **Ticket I1: The plugin block schema.** Define the block type in
  `packages/install`: identity, version, dependencies, files installed,
  configuration modified, dsh configuration modified, environment changes,
  commands, integrations, other side effects, install, and detect-installed.
  Every field is data or a named action, never free-form shell. Every
  OS-divergent value in a block is asked of the V1 platform port, never branched
  on in the block itself. The schema carries a `reverse` field, but it is
  optional at v0.1.0 and unused: reversal is structural, because everything
  Thursday installs lives inside the Thursday home, so uninstall removes the home
  rather than replaying recorded effects. I3's ledger earns its place only when a
  block writes outside that home, and it is deferred to v0.2 for that reason. The
  block model itself is NOT deferred, and not because of reversal: `sync.sh` is
  1134 lines of shell that no single agent can hold, which is what makes the work
  impossible to dispatch in parallel. Blocks are how the migration is split.
  The load-bearing requirement is that the KNOWLEDGE IN THE COMMENTS SURVIVES.
  `sync.sh` records why in prose beside the code: why the compaction fork is
  installed under the basic package name (a direct install would insert rows the
  web patch already inserts and boot would die on a duplicate loader entry id),
  why three override rows must be top-level rather than children of the insert
  list, why the settings file must never take a full YAML round-trip (YAML 1.1
  reads `off:` as boolean and the schema then drops every pi-ai provider), and
  why `allowBuilds` needs a reconstructed codeload URL. A field the schema has no
  place for is a fact that gets deleted in translation, so the schema needs a
  first-class place for rationale and for constraints of that kind, and porting a
  step means porting its reasons. Blocked by R1, V1.

  **Evaluate:**

  - the schema is a typed object validated at load time
  - every non-obvious behavior recorded in a `sync.sh` comment has a field to live
    in, and a reviewer can point at each one in the schema
  - a block can state a constraint such as "must be a top-level override row" or
    "must not round-trip this file", and the installer honors it
  - the type has a doc comment per field explaining what belongs there
  - `reverse` is optional, and the schema says in its own doc comment why: the
    Thursday home is the reversal mechanism at v0.1.0

- [ ] **Ticket I2: Author a block per Thursday component.** Write the blocks:
  each host plugin, each client package, the third-party roster, the aidos
  package, the skills, the guards, the settings template, the presets, the MCP
  roster, and the branding override. Blocked by I1, P5.

  **Evaluate:**

  - every artifact `sync.sh` installed is covered by exactly one block
  - the rule is stated as a rule and not as a list: every client plugin this
    repository ships gets a block, so the ones written later are covered without
    this ticket being reopened to name them
  - exactly one block owns the branding override, and the schema makes a second
    block claiming the same file a validation error rather than a race
  - a coverage test fails when a new package has no block

- [ ] **Ticket I3: The install ledger.** DEFERRED TO v0.2. Record every effect an
  install applied, keyed by block and version, in the Thursday home. Uninstall
  reads the ledger, not the block, so a block that changed after install still
  reverses what was actually done. This is deferred because at v0.1.0 everything
  Thursday installs lives inside the Thursday home, and deleting that home
  reverses the install completely; a ledger would record effects that need no
  recording. It becomes necessary the moment a block writes outside the home,
  which is exactly what the branding override, the desktop entry, and the
  launcher on PATH do — so this is a v0.2 ticket rather than a discarded one, and
  I7 names those three exceptions explicitly instead of pretending they do not
  exist. Blocked by I1, C1.

  **Evaluate:**

  - the ledger records each file written, each config key set, and each command run
  - an install, an edit to the block, and an uninstall still leave a clean tree
  - the ledger is plain text a person can read without a tool, and `docs/` explains
    every field in it

- [ ] **Ticket I4: `thursday install`.** Implement the install command over the
  blocks: resolve dependencies, plan the actions, show what will change, and
  apply. It must be idempotent and safe to re-run. It writes no ledger at v0.1.0;
  I3 adds that in v0.2, so this ticket does not wait on it. Blocked by I2, C4, C5.

  **Evaluate:**

  - a clean machine gets the full Thursday composition in one command
  - a second run reports no changes and rewrites nothing
  - a dry run prints the same plan it would apply

- [ ] **Ticket I5: `thursday sync`.** Implement convergence: reconcile the
  installed state against the blocks, apply the difference, and report it. This
  is what a developer runs after editing the monorepo. Blocked by I4.

  **Evaluate:**

  - editing a plugin source and running sync updates the installed bundle
  - removing a block from the set removes its effects on the next sync
  - sync after install is a no-op

- [ ] **Ticket I6: `thursday status`.** Report the installed composition: which
  blocks are installed, at which version, what each one changed, and any drift
  from the blocks. This is the command that answers the brief's five questions.
  Without a ledger it reports by comparing the blocks against what is actually in
  the Thursday home, which is weaker than a ledger for detecting a removed file
  but sufficient to answer what is installed and what each block changes. Blocked
  by I2, I4.

  **Evaluate:**

  - status names every installed block and its version
  - status detects a hand-edited installed file as drift
  - status reports each block's rationale, so "why is this installed" is answered
    from the block rather than from a comment in a shell script
  - status explains how to disable and how to remove each block

- [ ] **Ticket I7: `thursday uninstall`.** Remove the Thursday home, and the
  small, enumerable set of things that deliberately live outside it: the launcher
  on PATH, the desktop entry or `.app` or `.lnk`, and the icon files. That list
  is the whole of the reversal problem at v0.1.0, because everything else
  Thursday installs is inside the home by design, and it is short enough to hold
  in one file rather than in a ledger. Enumerate it in code, not in prose, so
  adding a fourth outside-the-home effect without adding its removal fails a test.
  Do not touch unrelated user data: the AI scratch directory is the user's, not
  Thursday's, and E2 already promises uninstall leaves it alone, so name it and
  say so rather than deleting a directory the user has been working in. Blocked
  by I4.

  **Evaluate:**

  - uninstall leaves no Thursday file behind, verified by a tree diff
  - a file the user created inside the Thursday home survives uninstall, or the
    command names it and asks
  - the outside-the-home effects are enumerated in code, and adding one without
    its removal fails a test
  - the AI scratch directory and its contents survive uninstall, and the command
    says so
  - no file this install wrote outside the Thursday home survives uninstall,
    enumerated from the ledger rather than by inspection

- [ ] **Ticket I8: The shell bootstrapper.** Write `install/install.sh`: detect
  the platform, check for node and pnpm, fetch Thursday, and hand off to the
  TypeScript engine. It stays small and carries no installation logic of its
  own. Write it as POSIX sh from the first line rather than as bash: macOS still
  ships bash 3.2 and `curl | sh` may land in dash, so a bash-5 script here would
  have to be rewritten rather than extended. V6 is the CI job that keeps it that
  way. Blocked by I4.

  **Evaluate:**

  - `curl -fsSL <url> | sh` completes an install on a clean container
  - the script is under 120 lines and contains no plugin-specific knowledge
  - a missing prerequisite fails with a message naming what to install
  - no array, no `${var,,}`, and no process substitution appears in the script

- [ ] **Ticket I9: The upgrade path.** Upgrading Thursday reconciles blocks
  across versions: a renamed file is moved, a dropped block is reversed, a new
  block is installed. Blocked by I5, I6.

  **Evaluate:**

  - installing version A then version B leaves the same state as a clean B install
  - the upgrade reports what it changed
  - a block whose version fell behind is named in status
- [ ] **Ticket I10: Install and pin the dsh runtime itself.** Nothing in this
  plan currently gives a stranger a dsh to run. I8 checks only for node and pnpm,
  I2's block list stops at Thursday's own artifacts, and E6, C6 and E8 all speak
  of "the dsh package tree" and "dsh web" as though they already exist. On the
  author's machine they do; on a clean one they do not. Add the block that
  installs dsh, pinned to an exact version, into the Thursday home rather than
  globally, so Thursday's runtime and whatever dsh the user may already have are
  separate installs that cannot disturb each other. Record the pin in one place,
  because every composition row and every patch in this plan is written against a
  specific dsh, and an unpinned runtime turns an upstream release into a silent
  breakage. Adopting an existing global dsh instead is the alternative to
  consider and reject in writing: it would make the E6 guarantee untestable,
  since Thursday would then share the tree it promises not to touch. Blocked by
  I1, C1.

  **Evaluate:**

  - a machine with no dsh installed reaches a working Thursday session
  - a machine with a different dsh version installed keeps it, unmodified, and
    Thursday runs its own pinned copy
  - the pinned version appears in exactly one file, and a mismatch fails the build
  - uninstall removes Thursday's dsh and leaves any pre-existing one alone
  - the decision to install rather than adopt is recorded with its reason

- [ ] **Ticket V3: The macOS install target.** Make `thursday install` produce a
  real macOS installation through the V1 port: the `.app` bundle with its
  `Info.plist`, the `.icns` icon, the launcher on PATH, and the Thursday home
  where macOS users expect it. Uninstall reverses all of it, including the Launch
  Services registration. macOS cannot be containerized, so the fake proves the
  plan and a `macos-15` runner proves the filesystem calls. Blocked by V1, I4, B2.

  **Evaluate:**

  - a `macos-15` runner completes install, launch, and uninstall
  - the app appears in Spotlight with the Thursday name and icon
  - uninstall leaves no `.app`, no icon, and no Launch Services entry
  - the E6 byte-identity check passes on macOS, which is where that assertion
    lives; this ticket adds no checksum of its own
- [ ] **Ticket V4: Settle the Windows stance.** Windows has no bash, and
  Thursday's guard model parses bash commands: the aidos preset already carries
  the only platform branch in either source repository. Decide and document
  whether Thursday supports Windows through WSL2 only, or natively with a
  degraded tool set, and make the installer act on the decision rather than
  failing late. Record the reasoning in `docs/platforms.md`. This changes roughly
  eight tickets, so settle it before the install engine hardens. Blocked by V1.

  **Evaluate:**

  - `docs/platforms.md` states the supported Windows path and why the other lost
  - the installer detects an unsupported configuration before writing anything
  - the bash-guard and the presets behave per the decision, with a test proving it
  - the website's installation page states the Windows requirement plainly
- [ ] **Ticket V8: The Windows install target.** macOS got V3, which builds the
  `.app`, the `.icns`, the launcher and the Launch Services reversal. Windows got
  only V4, which decides the stance and documents it. That leaves T2 requiring
  the lifecycle to pass on "the supported Windows path" with no ticket producing
  one. Implement whichever target V4 selects, through the V1 port: if WSL2, the
  detection, the guidance when it is absent, and the install inside it; if
  native, the `%LOCALAPPDATA%\Thursday` home, the `.lnk` in the Start Menu, the
  `.ico`, and the launcher on PATH. Uninstall reverses all of it. If V4 chooses
  WSL2-only this ticket is small and mostly detection and messaging, and it
  should say so rather than being quietly dropped. Blocked by V1, V4, I4, B2.

  **Evaluate:**

  - a Windows runner completes install, launch, and uninstall on the path V4 selected
  - the shortcut or launcher V4's decision implies exists and starts Thursday
  - uninstall leaves no shortcut, no icon, and no registry or Start Menu entry
  - an unsupported Windows configuration is detected and explained before anything
    is written
  - T2's Windows leg has a real target to run against
- [ ] **Ticket V6: Prove the bootstrapper under every target shell.** I8 writes
  `install/install.sh` as POSIX sh; this ticket is the CI job that stops it
  drifting back. Today's `sync.sh` uses bash 4 constructs — `local -a` arrays,
  `${#arr[@]}` — that fail on the bash 3.2 macOS still ships and in dash, and a
  constraint with no test decays. Run the script under `dash`, `bash --posix`,
  and a bash 3.2 build on every change to it. Blocked by I8.

  **Evaluate:**

  - the script runs to completion under dash, under `bash --posix`, and under a
    bash 3.2 build
  - `shellcheck -s sh` is clean
  - the job runs on every change to `install/install.sh`, and a bash-4 construct
    introduced there fails it; the construct list itself lives in I8's criteria
    and is not restated here

## Phase 6: Branding — `pending`

- [ ] **Ticket B1: Inspect the DSH branding surface.** Find exactly which
  manifest, application-name, icon, and desktop-entry values dsh reads, and
  which of them can be overridden per home rather than globally. Write the
  findings in `docs/branding.md`. Blocked by C1.

  **Evaluate:**

  - the document names each override point and the file that owns it
  - each point is marked per-home or global, with evidence from the dsh source
  - anything not overridable per home is called out with the workaround

- [ ] **Ticket B2: The Thursday mark.** Produce the icon and wordmark in the
  sizes the desktop entry, the web app manifest, and the website need, in the
  dark high-contrast visual system from D1. The source mark is
  `assets/thursday-logo.svg`, already in the repository; this ticket derives the
  export set from it and adds the wordmark. Blocked by D1.

  **Evaluate:**

  - the 16px raster is legible as a distinct shape: no stroke thinner than one
    pixel and no two features closer than one pixel at that size
  - the set ships png and svg for Linux, `.icns` for macOS, and `.ico` for Windows
  - the asset set covers every size the manifest and desktop entry require
  - the source is committed as vector, not just raster exports

- [ ] **Ticket B3: Install the branding reversibly.** Apply the overrides from
  B1 as a plugin block: Thursday name, icon, and metadata for the Thursday home
  only, with DSH attribution kept for developers. Blocked by B1, B2, I2.

  **Evaluate:**

  - the Thursday app shows the Thursday name and icon
  - the user's normal dsh install still shows dsh branding
  - uninstall removes the desktop entry and every override

## Phase 7: Skills and wizards — `pending`

- [ ] **Ticket S1: Port customize-setup to customize-thursday.** Rewrite the
  skill for the new architecture: Thursday and Quick, the dedicated DSH home,
  plugin blocks, installation state, branding, and reversible configuration.
  Keep the generator that fills the live dsh version. Delete the old skill from
  the Thursday tree so there is one implementation. Blocked by C6, I6.

  **Evaluate:**

  - the skill explains both presets and when to use each
  - the skill teaches the block model, not `sync.sh`
  - following the skill start to finish adds a working plugin, with every step it
    names resolving to a real file or command in this repository

- [ ] **Ticket S2: Curate the migrated skill set.** Move the general skills into
  `skills/`, update every reference to `sync.sh`, `$DSH_HOME`, or the old
  repository layout, and leave the personal skills behind. Blocked by M1, S1.

  **Evaluate:**

  - no migrated skill references `dotfiles-ai` or `sync.sh`
  - the personal skills named in the boundary are absent from Thursday
  - every skill's frontmatter still parses and the skill loads in a session

- [ ] **Ticket S3: The agent installation skill.** Write the skill that lets a
  user's existing agent install Thursday: inspect the environment, detect the
  OS and tools, detect existing dsh or Thursday installs, explain the changes,
  install, configure, verify, report, and explain uninstallation. It calls the
  TypeScript engine and implements no installer of its own. Blocked by I4, I6,
  I7.

  **Evaluate:**

  - the skill's every install step is a `thursday` command
  - a dry run in a container produces a change report before anything is written
  - the skill's uninstall section matches what `thursday uninstall` actually does

- [ ] **Ticket W1: The Cloudflare wizard.** Use the `wizard` skill and its
  template to build the Cloudflare setup wizard: account, API token with the
  least scopes needed, and the values the deploy step consumes. It uses the
  `wizard` skill where that skill already lives, so it does not wait on S2 and
  the website track stays free of migration churn as the prose claims. Blocked by
  nothing.

  **Evaluate:**

  - `bash -n` passes and shellcheck is clean
  - every captured value lands where the wizard says it will
  - the token scopes are the minimum the deploy actually needs
  - re-running the wizard is safe and reports the existing configuration

- [ ] **Ticket W2: The domain configuration wizard.** Walk the user through
  pointing `trythursday.org` at the deployed site, including the DNS records and
  the verification step. Blocked by W1.

  **Evaluate:**

  - the wizard verifies the records resolve before it reports success
  - it is safe to rerun against an already-configured domain

- [ ] **Ticket W3: The website deployment wizard.** Walk the first deploy of the
  site, using the Cloudflare values from W1. Blocked by W1, WS1.

  **Evaluate:**

  - a first-time user reaches a live preview URL by following the wizard
  - the wizard reports the resulting configuration at the end

- [ ] **Ticket W4: The demo deployment wizard.** Walk the deploy of the demo
  container and its public entry point, including the safety checks. Blocked by
  W1, DM3.

  **Evaluate:**

  - the wizard refuses to deploy when a credential or personal file is present
  - it reports the demo's public URL and how to tear it down
- [ ] **Ticket V5: Rewrite caffeine against the platform port.** The user
  promoted `skills/caffeine` to Thursday. It cannot move as it stands: it is not
  a Linux script but a this-machine script, calling `systemd-inhibit` and
  `kscreen-doctor` and defaulting `DBUS_SESSION_BUS_ADDRESS` and
  `WAYLAND_DISPLAY` to the values one KDE Wayland session uses on one laptop.
  Rewrite it over the V1 port: sleep inhibition and display blanking become port
  capabilities, with `systemd-inhibit` plus a non-KDE Linux fallback,
  `caffeinate -dis` and `pmset displaysleepnow` on macOS, and
  `SetThreadExecutionState` on Windows. Keep the existing safety rule that
  blanking refuses unless an inhibitor is already held. Blocked by V1, S2.

  **Evaluate:**

  - inhibit, release, status, and blank each work on all three systems
  - no hardcoded compositor, D-Bus address, or display name remains
  - a Linux desktop without kscreen-doctor still inhibits sleep and says blanking is unavailable
  - blanking still refuses when no inhibitor is held
- [ ] **Ticket V7: Make the promoted personal skills install everywhere.** The
  user promoted caffeine, etu, easyeda, and nostr out of `dotfiles-ai`. V5 covers
  caffeine, which needed a rewrite; this ticket covers the other three, whose
  obligation the plan states in prose and otherwise drops. `etu` is the real work:
  it shells out to a CLI that is installed by hand on one machine today, so the
  skill must either detect and install it per system through the V1 port or state
  plainly that it is unavailable and why. `easyeda` and `nostr` are MCP-gated and
  mostly OS-neutral, so the work there is confirming that claim rather than
  assuming it: check every path, binary, and environment variable each one names.
  Blocked by V1, S2.

  **Evaluate:**

  - `etu` either installs its CLI on each supported system or reports it as
    unavailable with the reason, and never fails silently
  - each of the three skills is loaded on each supported system and its declared
    prerequisites resolve, or it says which one did not
  - no promoted skill contains an absolute path outside the Thursday home, a
    hostname, or a binary path, checked by grep the way V5's criterion is

## Phase 8: Website and demo — `pending`

- [ ] **Ticket WS1: The website scaffold.** Create `website/` as a static site
  wired to the D1 tokens, with the dark high-contrast system, dense layout,
  editor-like surfaces, real focus states, and keyboard navigation. No generic
  SaaS styling. Blocked by D1.

  **Evaluate:**

  - the site builds to static output with no runtime framework requirement
  - every color comes from a token
  - the site is navigable by keyboard alone, with visible focus throughout

- [ ] **Ticket WS2: The landing page.** Write the page around the four product
  goals — make cheap models useful, get more useful work per token, front-load
  planning, keep the user in control — plus background execution, which the brief
  names as a landing-page claim and which is the mechanism the other four rely
  on. Five claims on the page, four goals in the product: the README and DOC1
  state the four, and this page adds the fifth as a mechanism rather than a fifth
  goal, so the two documents do not disagree. Show the real workflow, not a
  generic AI pitch. Blocked by WS1.

  **Evaluate:**

  - each of the five claims is explained by naming the mechanism that delivers it,
    not by restating the claim
  - the four goals on the page are word-for-word the four in the README
  - the page shows the plan-to-tickets-to-background-execution flow
  - the install command appears above the fold and is copyable

- [ ] **Ticket WS3: The Thursday and Quick page.** Explain both presets, when
  each fits, and that they share one installation and one plugin set. Blocked by
  WS2.

  **Evaluate:**

  - the page states the distinction as workflow overhead, not capability
  - it lists concrete Quick tasks and concrete Thursday tasks

- [ ] **Ticket WS4: The installation path.** Publish the install command, the
  prerequisites, the uninstall command, and what the installer changes. Serve
  `install.sh` from the site. Blocked by I8, WS1.

  **Evaluate:**

  - the published URL serves the bootstrapper over HTTPS
  - the page lists what the installer writes and how to reverse it
  - a copy-paste of the command works on a clean container

- [ ] **Ticket WS5: Deploy the site.** Ship the site to Cloudflare with a
  repeatable deploy command. Blocked by W1, W3, WS2.

  **Evaluate:**

  - the deploy command is one script, runnable from a clean checkout
  - the live site serves the landing page and the install script

- [ ] **Ticket DM1: The public demo configuration.** Build the public demo on the
  E8 image rather than a second image: same installer, same composition,
  differing only in configuration — free-model routing, no bind mounts, no
  credentials, and the E4 tour workspace. The brief is explicit that the demo
  must not be a separate implementation of Thursday, and sharing the image is
  what enforces that. Blocked by E8.

  **Evaluate:**

  - the demo is the E8 image plus configuration, with no second Dockerfile
  - the container runs `thursday install` and reaches a working session
  - the image contains no credential, no session log, and no personal file

- [ ] **Ticket DM2: Free-model demo routing.** Configure the demo's model
  profile so basic exploration needs no paid account, using free routes only,
  and degrade clearly when a route is unavailable. Blocked by DM1, C5.

  **Evaluate:**

  - a demo session completes a small task with no API key supplied
  - an exhausted free route produces a readable message, not a crash

- [ ] **Ticket DM3: Demo safety.** Bound the demo for public exposure: no
  network egress beyond what the models need, no host filesystem access,
  resource limits, and a reset between sessions. Blocked by DM1.

  **Evaluate:**

  - a session cannot read or write outside its container
  - a session's state is gone after a reset
  - the limits are documented and enforced by configuration, not convention

- [ ] **Ticket DM4: The demo entry point.** Put the E4 tour workspace in front of
  a first-time visitor and link it from the landing page. This ticket authors no
  tour content: E4 owns the seeded workspace, the tutorial script, and the toy
  source, and duplicating any of it here is how the two copies drift. The work is
  the entry path — landing, session start, and the one adjustment a public visitor
  needs that a local installer does not. Blocked by DM2, DM3, WS2, E4.

  **Evaluate:**

  - a first-time visitor reaches a planned ticket and a background agent run
  - the tour content is the E4 workspace, with no second copy in `demo/`
  - the tour uses the real Thursday composition, not a demo-only build
  - the landing page links to a working demo entry point

## Phase 9: Testing and documentation — `pending`

- [ ] **Ticket T1: Install-engine unit tests.** Cover the block schema, the
  planner, the ledger, and the reversal logic against a temporary home. Blocked
  by I4, I7.

  **Evaluate:**

  - install, sync, status, and uninstall each have tests against a temp home
  - a block with an unreversible effect fails a test
  - the suite runs in under two minutes on a cold checkout, with no network

- [ ] **Ticket T2: The lifecycle test.** Run the brief's lifecycle end to end on
  every supported system: normal dsh, install Thursday, use Thursday, use Quick,
  uninstall, normal dsh unchanged. Linux runs in a container. macOS cannot be
  containerized, so it runs on a `macos-15` runner against a clean runner home.
  Windows runs per the V4 decision. This is E6's check run on the other two
  systems, not a new assertion: E6 owns the byte-identity guarantee and proves it
  on the development platform, and this ticket is what makes the claim true
  everywhere Thursday ships. Blocked by C6, I7, E6, V2, V3, V4.

  **Evaluate:**

  - the E6 byte-identity check passes unmodified on each supported system
  - both presets complete a real task inside the test
  - the lifecycle passes on Linux, on macOS, and on the supported Windows path
  - the test runs from one command per system

- [ ] **Ticket T3: The composition smoke test.** Boot both presets and assert
  the expected tool set: the board tools present in Thursday, absent in Quick,
  and the guard-registered `bash` present in both with no duplicate
  registration. Blocked by C2, C3.

  **Evaluate:**

  - the test fails when a preset registers a tool twice
  - the test fails when a board tool leaks into Quick

- [ ] **Ticket DOC1: The root README.** Explain what Thursday is, the four
  product goals, the two presets, installation, uninstallation, and the
  repository layout. WS2 copies the four goal sentences word for word onto the
  landing page and has a criterion saying so, so any rewording here must be
  carried there in the same change; the two documents are one text in two places.
  Blocked by I8, C6.

  **Evaluate:**

  - the README defines every term it uses that a reader new to dsh would not know,
    at its first appearance, and a reviewer who has not used dsh confirms it
  - every command in the README works from a clean clone
  - the README states that AIDOS is the ticketing subsystem, not the product

- [ ] **Ticket DOC2: The architecture document.** Document the host plane, the
  agent plane, the block model, the DSH home layout, and how the two presets
  compose. This is the document `customize-thursday` points at. Blocked by C4,
  I2, S1.

  **Evaluate:**

  - the document answers the brief's five questions for the system as a whole
  - it names every directory in the monorepo and what owns it

- [ ] **Ticket DOC3: Contributor documentation.** Explain how to add a plugin, a
  skill, a preset row, or a block, and how to run the checks. Blocked by DOC2.

  **Evaluate:**

  - following the guide adds a working plugin end to end
  - the guide names the one command that validates a change

## Phase 10: Retirement — `pending`

- [ ] **Ticket X1: Cut dotfiles-ai to the personal shell.** Remove everything
  that moved, leaving the ecommerce skill and the personal residue confirmed in
  M1. Split `mcp-servers.json` so the personal servers stay and the general ones
  move. GATED: the user is still doing extensive work in both source
  repositories, so this does not start on a schedule. It starts when the user
  decides to stop working upstream and cut over. Until then N2 and N3 keep
  Thursday current and both repositories stay authoritative for their own work.
  The user go-ahead is not a blocker line, because it is not a ticket; it is the
  first criterion below. Blocked by T2, DOC1.

  **Evaluate:**

  - the user has explicitly approved the cutover in a ticket comment
  - `dotfiles-ai` contains only the confirmed personal set
  - the user's live workstation still works after the cut, verified in a session
  - nothing in `dotfiles-ai` installs a plugin Thursday also installs

- [ ] **Ticket X2: Point dotfiles-ai at Thursday.** Rewrite its README to say
  what it is now and where the general tooling went. Replace `sync.sh` with the
  thin remainder the personal shell still needs, or with a call into Thursday.
  Blocked by X1.

  **Evaluate:**

  - the README's first paragraph names Thursday and links to it
  - no script in the repository installs aidos from a GitHub pin

- [ ] **Ticket X3: Remove every dependency on the aidos repository.** Search
  both remaining repositories and Thursday for `github:xyzshantaram/aidos`,
  `AIDOS_PLUGIN_SPEC`, `pin-aidos.sh`, and any path into `~/repos/aidos`, and
  remove or repoint each one. Blocked by A7, I4.

  **Evaluate:**

  - a repository-wide search finds no reference to the old aidos remote
  - a clean install works with the old aidos repository moved away

- [ ] **Ticket X4: Archive the aidos repository.** Rewrite its README to state
  that AIDOS is now the ticketing subsystem inside Thursday, link to the new
  repository, and update the repository metadata: description, topics, and the
  archived flag. Do not delete it. Blocked by X3.

  **Evaluate:**

  - the README's first line states the move and links to Thursday
  - the repository is flagged archived and its description matches
  - the repository still contains its full history

## Phase 11: After 1.0 — `pending`

- [ ] **Ticket G1: The plugin platform and registry.** Deferred past 1.0 by the
  user, and recorded now so decisions taken during the migration do not
  foreclose it. The direction: plugins become a first-class product surface, not
  just an install-engine detail — third parties author them, publish them, and
  manage them easily, with a registry on the site. The pieces: the I1 block
  schema promoted from an internal format to a public, versioned extension
  manifest with a compatibility range; a `thursday plugin` CLI and a Plugins
  panel for add, remove, enable, disable, and update; an authoring path that
  starts as a dynamic Cordis plugin vibed in a live session and ejects into a
  real package, reusing the existing `cordis-plugin-development` skill rather
  than a parallel framework; and the registry itself, which should almost
  certainly be a static index generated from a manifests repository with
  artifacts hosted on npm or GitHub, served from the same Cloudflare deployment
  as the site. Pull requests are the moderation, and there is no server, no
  auth, and no secret storage. The trust story falls out of I1 for free: a block
  already declares its effects, so a registry entry can show exactly what a
  plugin changes before anyone installs it. What this asks of the work happening
  now is only that the block schema stay clean enough to make public.
  This ticket is deferred and is not started without the user reopening it. Its
  criteria are therefore obligations on work happening now, which are checkable
  today, rather than acceptance criteria for a registry nobody is building yet.

  **Evaluate:**

  - the I1 block schema carries no field whose value only Thursday could supply,
    and a block authored outside this repository validates against it unchanged
  - every plugin block records its effects in the form a registry entry would
    display, so publishing one needs no second description of what it changes
  - the A8 boundaries name no component that only a first-party plugin may mount

## Phase 12: The workspace surface — `pending`

An editor, a directory tree, and a git panel inside Thursday. Deliberately not in
Phase 0: v0.1 is the smallest thing a stranger can install and try, and an IDE
surface is a large addition that would delay the bundle without making the
try-it path any better. Where this lands relative to 1.0 is the user's call.

- [ ] **Ticket WK1: Survey the prior art and build the workspace panel shell.**
  The editor, the directory tree, and the git panel are one surface with three
  views, so they share a shell: a resizable region, a view switcher, and one
  notion of "the file currently open" that all three agree on. Build that first,
  because three panels each inventing their own selection state is how this
  becomes unusable. Do the survey before the shell, since the instruction is to
  reuse rather than reinvent: read the existing client packages for the patterns
  that already work here — `log-viewer` for a scrolling read-only pane,
  `session-archive` for a list-and-detail panel, `mcp-servers` for a settings
  surface with host-side state, and `shared/settings-panel.tsx` and
  `shared/client-util.ts` for the conventions every one of them follows. Record
  what is reusable and what is not, so WK2, WK3 and WK4 start from a known base
  instead of three different guesses. Note the constraint that shapes all of it:
  dsh's client plugins bundle CJS with npm dependencies inlined, because the
  browser module table cannot resolve npm packages, so anything these panels
  import is inlined and its size is a real cost. Blocked by TH1.

  **Evaluate:**

  - the survey names, for each existing plugin read, what is reused and what is not
  - the shell hosts a view and is resizable, and its size survives a page reload
  - one selection state is shared by every view, and selecting a file in one is
    visible in the others
  - the shell registers in a queried slot, with the slot and its contract recorded
  - the bundle size of the shell alone is measured and recorded as the baseline
- [ ] **Ticket WK2: The CodeMirror editor view.** A CodeMirror 6 editor in the
  WK1 shell, themed from the D1 tokens so it matches the rest of Thursday rather
  than shipping a stock theme. Read-only first and editing second, deliberately:
  a read-only viewer is most of the value at a fraction of the risk, and an
  editor introduces questions the plan must answer before it writes anything —
  what happens when the agent edits the file you have open, whether a save goes
  through the fs sandbox and the ticket allowlist like every other write, and
  what the file allowlist means for a human typing directly into a panel. Answer
  those in the ticket before enabling writes; a panel that bypasses the allowlist
  would silently defeat the guarantee AIDOS exists to provide. Syntax
  highlighting should come from the languages actually used here first, not from
  every CodeMirror language package, because each one is inlined into the bundle.
  Blocked by WK1, D1.

  **Evaluate:**

  - a file opens read-only with syntax highlighting and line numbers
  - every color in the editor resolves to a D1 token, with no stock CodeMirror theme
  - the file the agent is editing updates in the panel, or the panel says it is stale
  - whether writes are allowed is decided in writing, and if they are, a save is
    subject to the same fs sandbox and ticket allowlist as any agent write
  - a write attempt outside the allowlist is refused with the same message an
    agent would get
  - the added bundle size over the WK1 baseline is measured and recorded
- [ ] **Ticket WK3: The directory tree view.** A directory tree for the session's
  workspace in the WK1 shell, which opens a file into the WK2 editor. It reads
  through the host, never through a browser filesystem API, so the same sandbox
  that bounds agent reads bounds this one: a tree that can browse outside the
  workspace is an information leak in the demo container and in any remote-access
  session, both of which this plan ships. Lazy-load directory contents rather
  than walking the tree on open, because a `node_modules` in the workspace root
  would otherwise hang the panel, and honor the same ignore rules the rest of the
  tooling uses so the tree shows what the user thinks of as their project.
  Blocked by WK1.

  **Evaluate:**

  - the tree lists the workspace and expands a directory on demand, not on open
  - a workspace containing `node_modules` opens without a visible delay
  - selecting a file opens it in the editor view through the WK1 shared selection
  - no path outside the session workspace is reachable, including through a symlink
  - ignored paths are hidden by default and the rule doing the hiding is stated
- [ ] **Ticket WK4: The git panel.** A git panel in the WK1 shell showing status,
  the working diff, and recent history, with the diff rendered in the WK2 editor
  rather than in a second diff renderer. Read-only to begin with, and mutations
  gated: this repository's own bash-guard already treats git this way, running
  read-only verbs freely and making mutations ask, and a panel that lets a click
  do what a command must ask permission for would quietly route around that rule.
  So any button that changes repository state goes through the same approval path
  as the equivalent command, and the ticket says which buttons exist before it
  builds them. Reviewing an agent's diff is the reason this panel earns its place:
  it is the surface where a user decides whether work is acceptable, which is the
  review step the ticket lifecycle already depends on and currently sends people
  to a terminal for. Blocked by WK1, WK2.

  **Evaluate:**

  - status, the working diff, and recent history are visible for the workspace
  - the diff renders in the WK2 editor, with no second diff implementation
  - every action that mutates repository state goes through the same approval path
    as the equivalent bash-guard command
  - a repository with no commits, and a workspace that is not a repository at all,
    both render an explanation rather than an error
  - the panel shows an agent's uncommitted work well enough to review it without
    leaving the UI

## User preferences and special rules

- AIDOS stays the internal name for the ticketing subsystem. Do not rename
  identifiers just to remove the word.
- Do not fork dsh. Fork only the plugins that need forking.
- Prose in docs and skills follows STE-flavored Simplified Technical English,
  matching the existing skills.
- The user is still working in both source repositories. Nothing destructive
  happens in either one without an explicit go-ahead.
- The install engine owns all installation logic. The shell installer stays a
  bootstrapper, and no skill implements a second installer.
- Plugins become a public extension surface after 1.0 (G1). Keep the block
  schema clean enough to publish, and do not assume the only author is us.
- References to `~/.dsh` in the user's own instructions mean the Thursday home,
  not the real dsh home.

## Human review queue

- [ ] M1 — confirm the executable map covers every path, with no remainder.
- [ ] A6 — approve the decision on the dsh fs-sandbox patch.
- [ ] A8 — approve the AIDOS plugin boundaries before any code moves.
- [ ] C1 — approve the Thursday DSH home layout before the install engine builds on it.
- [ ] D1 — approve the derived token palette against the shcmonokai reference.
- [ ] V4 — decide the Windows stance: WSL2 only, or native with a degraded tool set.
- [ ] E1 — walk the install wizard as a stranger would, before v0.1 ships.
- [ ] E4 — take the tour cold and say where it loses you.
- [ ] B2 — pick the mark direction and check it at 16px before the exports are cut.
- [ ] TH4 — confirm Literata, Inter, and Fantasque Sans Mono before they are bundled.
- [ ] T2 — watch the lifecycle test on the real workstation before Phase 10 begins.
- [ ] X1 — call the cutover when you are ready to stop working upstream.
