---
id: spill-root
title: Spill store root under /tmp/thursday
version: 1
rationale: >
  Pins the spill store's root under /tmp/thursday. The default root is a private
  mkdtemp directory under the OS tmpdir, which sits outside the sandbox's
  writable roots, so a spilled tool result lands where the agent cannot
  follow: every read of the spilled path fails under the default workspace
  policy. /tmp/thursday is the sanctioned scratch root the sandbox already allows
  and the file panel already exposes, so the spill root is pinned under it.
dependsOn: [dsh-runtime]
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [spill-local]
    placement: override
    constraint: wholesale-override-config
    why: >
      dsh ships the spill-local row, so reconfiguring it is a top-level
      override row, never a child of the insert list — an insert with the same
      id kills boot. The row carries a `config:`, and override assignment is
      wholesale rather than a deep merge, so this override must restate every
      default the shipped row sets. Today the shipped row carries no other
      config keys, which is what makes the wholesale replace safe; if dsh adds
      one, this block must restate it or the key silently disappears.
steps:
  - action: patch-row
    id: spill-local
    name: "@deepseek-ai/dsh-spill-local"
    placement: override
    constraint: wholesale-override-config
    config:
      root: /tmp/thursday/spill
    why: >
      The spilled path is only useful if the agent can read it back. The
      private mkdtemp default defeats that: the write succeeds, the read
      fails, and the failure surfaces as an unreadable tool result rather
      than as a spill misconfiguration. /tmp/thursday/spill is under the root the
      fs sandbox already permits and the remote file panel lists
      (files.roots in the remote block), so write and read both work.
detect:
  - action: row-present
    id: spill-local
    placement: override
---

# spill-root

One override row, carrying one value: where spilled tool results go.

## Why this is a row and not a settings key

The spill store is configured on its composition row, not in settings.yaml.
There is no key to write; there is only the row's `config:` block, which is
why the whole block is one patch-row step.

## The wholesale rule, applied small

The override replaces the shipped row's `config:` wholesale. Today that costs
nothing: the shipped row carries no config keys, so restating "everything it
set" means setting the one key this block wants. The constraint is declared
anyway, because the safety is an accident of the current dsh version — the
day the shipped row grows a second key, this override deletes it silently,
and the constraint is what makes the loader's check and the next reader ask
the question before boot does.

## What to check when it goes wrong

Spilled results readable in the file panel but not by the agent means the
root moved outside the sandbox's writable roots. A boot failure naming
spill-local means the row slipped into the insert list, which is a duplicate
id, not a reconfiguration.
