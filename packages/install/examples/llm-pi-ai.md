---
id: llm-pi-ai
title: llm-pi-ai (vendored fork)
version: 1
rationale: >
  A vendored fork of the dsh pi-ai adapter. It is the only pi-ai adapter
  registrar in a Thursday install: the builtin row is disabled so two
  registrars cannot claim one provider name.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/@deepseek-ai/dsh-llm-pi-ai
    from: packages/plugins/llm-pi-ai
    what: the vendored adapter, linked into the web profile
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [llm-pi-ai-affinity]
    placement: insert
    why: >
      The fork mounts under its own id so the builtin id stays free for the
      override row below.
  - file: profiles/web/cordis.patch.yml
    rows: [llm-pi-ai]
    placement: override
    constraint: top-level-override
    why: >
      dsh-base already owns the llm-pi-ai id, so this has to be a top-level
      override row rather than a child of the insert list; a second row with
      that id kills boot on a duplicate loader entry id. applyEntryPatches also
      assigns each override key wholesale rather than deep-merging, so a
      partial override silently drops every default it does not restate.
steps:
  - action: pnpm-add
    spec: ./packages/plugins/llm-pi-ai
  - action: patch-row
    id: llm-pi-ai-affinity
    name: "@deepseek-ai/dsh-llm-pi-ai"
  - action: disable-row
    id: llm-pi-ai
    constraint: top-level-override
    why: >
      Disabling the builtin avoids duplicate adapter registration; the fork
      mounts as llm-pi-ai-affinity instead.
detect:
  - action: row-present
    id: llm-pi-ai-affinity
    name: "@deepseek-ai/dsh-llm-pi-ai"
---

# llm-pi-ai

The pilot block for the format (I12), and the block that exercises the
fiddliest thing in the composition: wholesale override assignment.

## What the fork changes

It adds provider affinity to the upstream pi-ai adapter, so a model request
routes to the provider that actually serves it rather than to the first
registrar that claimed the name.

## What breaks without it

Nothing visible at boot. Requests route to the wrong provider and fail at the
API rather than in dsh, so the error text names a model the user never chose.

## What to check when it goes wrong

Boot failing with "duplicate loader entry id: llm-pi-ai" means the override row
moved into the insert list. Every pi-ai provider disappearing means the
settings file took a YAML round-trip somewhere: see the thursday-defaults
block.
