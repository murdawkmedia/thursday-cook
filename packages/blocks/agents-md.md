---
id: agents-md
title: The home AGENTS.md
version: 1
rationale: >
  The agent instruction file installed at the root of the Thursday home. It
  carries the operating rules every agent session inherits — sandbox escalation
  discipline, subagent dispatch rules, review posture — general to every
  Thursday install and therefore shipped by Thursday rather than by the user.
  The thursday-defaults block owns settings and the standard preset; this file
  is the third thing sync.sh copied into the home root, and it is a block of
  its own because deleting it has a visible effect on every session's
  behaviour and no effect on any other block.
dependsOn: [dsh-runtime]
installs:
  - path: AGENTS.md
    from: config/AGENTS.md
    what: the home agent instruction file
steps:
  - action: copy-tree
    from: config/AGENTS.md
    to: AGENTS.md
    why: >
      A single file copied whole and overwritten every install, exactly as
      sync.sh's step_sync_agents_md did with cp. Git owns the content; the
      installed copy is not state. If the copy-file action exists by the time
      this block is executed, it is the more honest step name — copy-tree of
      one file is the same operation either way.
detect:
  - action: path-exists
    path: AGENTS.md
---

# agents-md

The rules file at the root of the Thursday home.

## Why the home root and not per-preset

The file speaks to every agent regardless of preset, the same way the
host-plane plugins apply regardless of preset. Presets shape what a session
can do; this file shapes how every session behaves inside those shapes. A
per-preset copy would fork the rules and let them drift.

## Overwrite, never merge

sync.sh's step copied the file flat on every run, and that behaviour is kept
on purpose: the file is content-addressed to this repository, and a merge
would turn a typo fix here into a patch that never reaches the home. A user
who needs a local rule appends it to their own file or edits after install
knowing the next install reverts it — the same contract as settings.yaml, and
for the same reason.

## What to check when it goes wrong

An agent escalating the wrong way, or asking for a mode it already holds, is
the file missing or stale: check `AGENTS.md` under the home before blaming
the harness. Sessions pick up the file live; no restart is needed beyond
what other block changes already require.
