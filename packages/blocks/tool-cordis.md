---
id: tool-cordis
title: cordis tools (host base, not installed)
version: 1
rationale: >
  The cordis_* tools, gated behind the two cordis skills by the skill gate.
  This block installs nothing on purpose: the row resolves against the host
  base, because the dsh install already bundles a newer and more complete
  build than the registry publishes.
dependsOn: [dsh-runtime, host-plane]
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [tool-cordis]
    placement: insert
    why: >
      One row and no install. The name is a bare package specifier, so the
      profile does not shadow it and it resolves against the host base — which
      is the whole mechanism this block relies on.
steps:
  - action: patch-row
    id: tool-cordis
    name: "@deepseek-ai/dsh-tool-cordis"
    why: >
      Do NOT add a pnpm-add step for this name. The registry's latest release
      registers three tools; the bundled build registers the full set
      (inspect_list, inspect_query, inspect_self, define, run, stop,
      undefine). Installing it into the profile would shadow the complete tool
      set with an incomplete one, and the loss is silent — the row mounts, the
      tools are simply missing.
detect:
  - action: row-present
    id: tool-cordis
    name: "@deepseek-ai/dsh-tool-cordis"
---

# tool-cordis

The block that exists to write one row and install nothing.

## Why a block at all

Because the decision not to install is worth as much as an install, and it is
the kind of decision that gets undone by someone tidying up. A row with no
package behind it looks like an oversight; the block says it is not, and the
step's `why` says what breaks if the oversight is "fixed".

## What to check when it goes wrong

`cordis_define` missing while `cordis_inspect_list` works means the profile
acquired its own copy of the package. Remove it from the profile and let the
row resolve against the host base again.
