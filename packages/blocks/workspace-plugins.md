---
id: workspace-plugins
title: First-party workspace plugin packages
version: 1
rationale: >
  The seventeen first-party plugin packages that are neither plugin files on
  the host plane (those are the host-plane block) nor big enough to have
  earned their own block (job-viewer and mcp-servers have blocks of their
  own, and llm-pi-ai is a vendored fork). Each is a workspace package
  installed from a path, linked rather than fetched, and each mounts its own
  row from its own cordis.patch.yml, so this block writes no composition
  rows at all. Delete this block and exactly these seventeen panels, tools
  and affordances disappear; nothing else in the composition references
  them.
dependsOn: [dsh-runtime, host-plane]
installs:
  - path: profiles/web/node_modules/session-archive
    from: packages/plugins/session-archive
    what: archive and restore sessions from the UI
  - path: profiles/web/node_modules/subscriptions
    from: packages/plugins/subscriptions
    what: provider subscription panel
  - path: profiles/web/node_modules/tool-render
    from: packages/plugins/tool-render
    what: the tool-card renderer
  - path: profiles/web/node_modules/profiles-client
    from: packages/plugins/profiles-client
    what: browser half of the profiles host plugin — the profile/route picker
  - path: profiles/web/node_modules/approval-comment
    from: packages/plugins/approval-comment
    what: attach a comment when approving or rejecting
  - path: profiles/web/node_modules/durable-todos
    from: packages/plugins/durable-todos
    what: the todo panel that survives an interrupt
  - path: profiles/web/node_modules/context-meter
    from: packages/plugins/context-meter
    what: the surface-measured context ring
  - path: profiles/web/node_modules/system-fonts
    from: packages/plugins/system-fonts
    what: the system font-stack override
  - path: profiles/web/node_modules/tooltips
    from: packages/plugins/tooltips
    what: styled tooltips
  - path: profiles/web/node_modules/composer-menu
    from: packages/plugins/composer-menu
    what: the composer overflow menu
  - path: profiles/web/node_modules/log-viewer
    from: packages/plugins/log-viewer
    what: read the harness logs from the UI
  - path: profiles/web/node_modules/toast
    from: packages/plugins/toast
    what: the app-wide toast stack; other packages reach it through the global it publishes
  - path: profiles/web/node_modules/modal
    from: packages/plugins/modal
    what: the app-wide modal host; other packages reach it through the global it publishes
  - path: profiles/web/node_modules/composer-approvals
    from: packages/plugins/composer-approvals
    what: pending-approval indicator beside the composer overflow trigger
  - path: profiles/web/node_modules/quote-selection
    from: packages/plugins/quote-selection
    what: floating quote button on assistant-message selections
  - path: profiles/web/node_modules/restart-pause
    from: packages/plugins/restart-pause
    what: debug settings panel for draining sessions and restarting dsh
  - path: profiles/web/node_modules/user-bubble
    from: packages/plugins/user-bubble
    what: markdown user/steering bubbles with hard breaks outside fenced code
steps:
  - action: pnpm-add
    spec: ./packages/plugins/session-archive
  - action: pnpm-add
    spec: ./packages/plugins/subscriptions
  - action: pnpm-add
    spec: ./packages/plugins/tool-render
  - action: pnpm-add
    spec: ./packages/plugins/profiles-client
  - action: pnpm-add
    spec: ./packages/plugins/approval-comment
  - action: pnpm-add
    spec: ./packages/plugins/durable-todos
  - action: pnpm-add
    spec: ./packages/plugins/context-meter
  - action: pnpm-add
    spec: ./packages/plugins/system-fonts
  - action: pnpm-add
    spec: ./packages/plugins/tooltips
  - action: pnpm-add
    spec: ./packages/plugins/composer-menu
  - action: pnpm-add
    spec: ./packages/plugins/log-viewer
  - action: pnpm-add
    spec: ./packages/plugins/toast
  - action: pnpm-add
    spec: ./packages/plugins/modal
  - action: pnpm-add
    spec: ./packages/plugins/composer-approvals
  - action: pnpm-add
    spec: ./packages/plugins/quote-selection
  - action: pnpm-add
    spec: ./packages/plugins/restart-pause
  - action: pnpm-add
    spec: ./packages/plugins/user-bubble
detect:
  - action: package-installed
    name: session-archive
  - action: package-installed
    name: subscriptions
  - action: package-installed
    name: tool-render
  - action: package-installed
    name: profiles-client
  - action: package-installed
    name: approval-comment
  - action: package-installed
    name: durable-todos
  - action: package-installed
    name: context-meter
  - action: package-installed
    name: system-fonts
  - action: package-installed
    name: tooltips
  - action: package-installed
    name: composer-menu
  - action: package-installed
    name: log-viewer
  - action: package-installed
    name: toast
  - action: package-installed
    name: modal
  - action: package-installed
    name: composer-approvals
  - action: package-installed
    name: quote-selection
  - action: package-installed
    name: restart-pause
  - action: package-installed
    name: user-bubble
---

# workspace-plugins

Seventeen first-party packages, one block. They are grouped here because they
share every property that matters to the installer: authored in this
repository, installed from a path so no pin and no allowBuilds question can
arise, and self-mounting from their own cordis.patch.yml so this block writes
no rows. None of them is load-bearing for another block; each is a
user-facing surface that can vanish without breaking the composition.

## Why one block and not seventeen

The stranger test cuts both ways. Seventeen blocks would make the deletion of one
panel predictable, but none of these packages carries a composition row, a
pin, a hazard or a constraint — there is no fact for a per-plugin block to
record that the frontmatter above does not already carry. The per-plugin
reasoning lives below, where it is prose rather than a block of one step.

## Why one of them is different

**durable-todos** is the one with a failure mode worth remembering. The
official todos projection clears on every turn/start, so the panel blanks as
soon as the next message goes out. This package mirrors the list into a
projection that ignores turn/start. It self-mounts through its own
cordis.patch.yml — the reason this block writes no row for it — and if the
panel blanks mid-session again, the self-mount is the first thing to check.

## The rest, one line each

- **session-archive** — archive and restore sessions from the UI.
- **subscriptions** — provider subscription panel; needs the user's own
  credentials at runtime but ships none.
- **tool-render** — turns raw tool calls and results into readable cards.
- **profiles-client** — the browser half of the profiles host plugin; the
  host half is the `profiles` row in the host-plane block, and the picker is
  inert without it, which is why this block depends on host-plane.
- **approval-comment** — a rejection without a reason is a guess; this lets
  the human attach one.
- **context-meter** — the shipped ring reads a provider figure that only ever
  grows; this one is measured from the surface, so it falls after a
  compaction instead of pinning at full. Pairs with the compaction-instant
  block, which is what makes the fall happen.
- **system-fonts** — dsh hardcodes its font tokens on `:root` and its
  monospace stack ends at a named font with no `monospace` generic, so the
  browser never reaches the font the system is configured with. This
  overrides both tokens from `html:root`, which outranks `:root` without
  needing `!important`.
- **tooltips** — an element opts in with `data-dsh-tip` and keeps its own
  `title` attribute, which stays the fallback: if this package fails or never
  loads, the browser shows the native tooltip.
- **composer-menu** — the composer overflow menu; holds the sandbox picker
  and offers a slot for other plugins.
- **log-viewer** — read the harness logs from the UI instead of tailing a
  file.
- **toast** — one app-wide toast stack in shell.overlay; installs before
  anything that raises a toast, same ordering discipline as modal below.
- **modal** — one app-wide modal host in shell.overlay; installs before
  anything that opens a modal. The registry test pins that consumers reach
  the shared component through the global rather than forking it.
- **composer-approvals** — pending-approval indicator beside the overflow
  trigger, with a modal listing every pending approval (reaches modal
  through its global, which is why modal installs first).
- **quote-selection** — floating quote button on assistant-message
  selections; quoting appends the passage to the composer draft.
- **restart-pause** — debug panel: drain sessions, run preflight, restart
  dsh, report whether it came back.
- **user-bubble** — user/steering messages render as markdown with hard
  breaks outside fenced code.

## What to check when it goes wrong

A panel that is missing outright means its package did not link; check the
profile's node_modules first. A panel present but wrong in a way this file
describes usually means the package's own cordis.patch.yml stopped mounting —
these packages carry their own rows, so a composition regenerated without
them is the suspect, not this block.
