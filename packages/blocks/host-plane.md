---
id: host-plane
title: Host-plane plugin files
version: 2
rationale: >
  The personal host-plane plugins, which apply to EVERY session regardless of
  preset: the bash guard (rules read live from the guards directory), the
  manifest guard, the package tool, the skill gate, the profile-routed see
  vision helper, the log exporter, the shared-tmp mount, the grant tool, the
  ask/interrupt pair, the profile router and the resume command. They are
  plugin files rather than packages, and they resolve their @deepseek-ai/*
  imports against the host base; unbash and the walker are bundled inside each
  file.
dependsOn: [dsh-runtime]
installs:
  - path: plugins/host
    from: packages/plugins/host-plane/dist
    what: >
      the twelve host-plane plugin bundles, built by @trythursday/host-plane's
      build.config.mjs into dist/ and installed flat: see, profiles, grant,
      resume, ask-interrupt, log-exporter, bash-guard, manifest-guard,
      package-tool, tmp-dsh-shared, approval-interrupt, and subagent-steer.
      skill-gate is context-guard.ts upstream, ported as part of this package.
  - path: plugins/guards
    from: config/guards
    what: the bash-guard rule files, which the guard re-reads at runtime
  - path: plugins/command-hooks
    from: command-hooks
    what: >
      the command-hook executables bash-guard offers to hooks when rules gate.
      Mirrored whole (wipe + copy, preserving the execute bit): a hook the
      repo stopped shipping must actually disappear, or it keeps allowing
      commands forever. Copied from dotfiles-ai/command-hooks.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows:
      - log-exporter
      - bash-guard
      - manifest-guard
      - package-tool
      - skill-gate
      - see
      - tmp-dsh-shared
      - grant
      - ask-interrupt
      - profiles
      - resume-command
    placement: insert
    why: >
      Eleven new rows, none of which any upstream bundle owns, so all of them
      are inserts. They mount on the host plane deliberately: a preset may
      change which tools a session sees, but never whether the bash guard runs.
      Every MCP server now lives in the mcp-servers plugin, which reads
      mcp-servers.json; the built-in dsh-mcp-client rows are gone, because two
      registrars for one server name would register each tool twice.
steps:
  - action: copy-tree
    from: packages/plugins/host-plane/dist
    to: plugins/host
    why: >
      The host-plane package builds each source file to dist/<name>.js; the
      flat dist directory is what dsh reads as plugins/host. Built by
      `build:plugins` before install reaches this block.
  - action: copy-tree
    from: config/guards
    to: plugins/guards
  - action: copy-tree
    from: command-hooks
    to: plugins/command-hooks
  - action: patch-row
    id: log-exporter
    name: ./plugins/host/log-exporter.js
  - action: patch-row
    id: bash-guard
    name: ./plugins/host/bash-guard.js
    config:
      guardsDir: ./plugins/guards
    why: >
      guardsDir points at a directory rather than naming rule files, because
      the guard re-reads the rules live: dropping a new rule file in is meant
      to take effect without a reinstall and without a restart.
  - action: patch-row
    id: manifest-guard
    name: ./plugins/host/manifest-guard.js
  - action: patch-row
    id: package-tool
    name: ./plugins/host/package-tool.js
  - action: patch-row
    id: skill-gate
    name: ./plugins/host/skill-gate.js
    config:
      alwaysDeny: [search, recall]
    constraint: nested-tool-config
    why: >
      search and recall come from the compaction package and are superseded by
      resume_search and resume_read. alwaysDeny hides them from every agent
      unconditionally, unlike a skill's per-skill unlock: no skill may
      re-expose them once loaded. The list belongs inside the row's own
      config block, where the plugin reads it.
  - action: patch-row
    id: see
    name: ./plugins/host/see.js
  - action: patch-row
    id: tmp-dsh-shared
    name: ./plugins/host/tmp-dsh-shared.js
  - action: patch-row
    id: grant
    name: ./plugins/host/grant.js
  - action: patch-row
    id: ask-interrupt
    name: ./plugins/host/ask-interrupt.js
  - action: patch-row
    id: profiles
    name: ./plugins/host/profiles.js
  - action: patch-row
    id: resume-command
    name: ./plugins/host/resume.js
detect:
  - action: path-exists
    path: plugins/host/bash-guard.js
  - action: path-exists
    path: plugins/command-hooks/worktree-commit
  - action: row-present
    id: bash-guard
---

# host-plane

Eleven plugin files that mount on the host plane, so they are in force for
every session whatever preset it runs.

## Why files rather than packages

They are this repository's own code and they change with it. A package would
add a publish step between writing a guard rule and running it, and the guard
is the one component where that delay is a safety problem rather than an
inconvenience.

## What breaks without it

The bash guard is the visible one: without its row, every translated and
denied command runs verbatim. The skill gate is the quiet one: without it,
`search` and `recall` reappear in every agent's tool list and shadow the resume
tools that replaced them.

## What to check when it goes wrong

A guard that does nothing usually means `guardsDir` resolved somewhere empty.
The row carries an absolute path, resolved from `./plugins/guards` against the
Thursday home at generation time, so the generated patch is the place to look.
