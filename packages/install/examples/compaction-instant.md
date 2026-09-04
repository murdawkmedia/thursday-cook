---
id: compaction-instant
title: Deterministic instant compaction
version: 1
rationale: >
  Deterministic compaction on the host plane, replacing the builtin basic
  engine, plus the /compact command that the web app turns off.
dependsOn: [dsh-runtime]
constraints:
  - name: alias-install-name
    why: >
      The package declares its own dsh.bundle patch, so installing it under its
      real name inserts compaction rows the web patch already inserts, and boot
      dies on a duplicate loader entry id. Installed under the basic name it
      shadows the builtin instead, and every row below names the basic package.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [compaction-instant, tool-recall]
    placement: insert
    why: >
      Two rows from one package: the engine and its recall tool. Both name
      the aliased package, not the fork's own name.
  - file: profiles/web/cordis.patch.yml
    rows: [command-compact]
    placement: override
    constraint: top-level-override
    why: >
      dsh-base mounts command-compact on the host plane and dsh-web-app then
      disables it, because the web app moves compaction into the preset plane.
      This bundle keeps a compaction engine on the host plane, so /compact
      belongs there too. It MUST be a top-level override row, not a child of
      the insert list: dsh-base already owns that id, and a second one kills
      boot with "duplicate loader entry id: command-compact".
steps:
  - action: pnpm-add
    spec: "github:xyzshantaram/dsh-compaction-instant#9525c7233d0f92651bd850ff7d49bb2d149d099f"
    as: "@deepseek-ai/dsh-compaction-basic"
    constraint: alias-install-name
    why: >
      A direct install under the fork's own name would insert rows the web
      patch already inserts, and boot dies on a duplicate loader entry id.
  - action: patch-row
    id: compaction-instant
    name: "@deepseek-ai/dsh-compaction-basic"
  - action: patch-row
    id: tool-recall
    name: "@deepseek-ai/dsh-compaction-basic/tool"
  - action: enable-row
    id: command-compact
    constraint: top-level-override
    why: >
      Re-enables the command dsh-web-app disables, as a top-level override row
      because dsh-base owns the id.
detect:
  - action: package-installed
    name: "@deepseek-ai/dsh-compaction-basic"
  - action: row-present
    id: compaction-instant
---

# compaction-instant

A fork of dsh-compaction-instant off published 0.1.4, installed under the name
of the package it replaces.

## Why the fork

Upstream fails every automatic compaction on some sessions: a node larger than
the retain ceiling crashes range selection, the checkpoint cap ignores the span
so the compiler elides nothing, and the fixed framing cost then makes the
checkpoint larger than what it replaces.

The fork also fixes compaction consuming its own checkpoints. Absorbing a prior
checkpoint whole nested the envelopes and freed almost nothing; automatic
pressure then read the token meter's anchored request total, which also counts
the system prompt, the tool schemas, and cache read and write tokens, so an
irreducible floor held the session above the threshold and compaction re-fired
at the next step and ate the checkpoint it had just written. It now triggers on
surface tokens alone.

## Upgrading

Bump the pin in the pnpm-add step. Do NOT track upstream main: it imports
@deepseek-ai/dsh-util-values, which needs a newer dsh than this bundle pins.
