---
id: aidos
title: aidos (planning and ticketing)
version: 2
rationale: >
  Thursday's planning and ticketing subsystem: tickets, evidence gates, and the
  plan format. Installed from git at a pinned commit, and it builds on install.
dependsOn: [dsh-runtime]
installs:
  - path: skills/aidos
    from: "github:xyzshantaram/aidos#fc435af68e384963a8575abd1ddac08e54daaa49"
    what: >
      the aidos skills, copied from the pinned package's own install at
      profiles/web/node_modules/aidos/skills — the package ships its skills,
      and sourcing them from the installed package keeps the pin the single
      source of identity, with no separate clone to drift
modifies:
  - file: profiles/web/pnpm-workspace.yaml
    key: allowBuilds
    constraint: needs-allow-builds
    why: >
      pnpm 10+ blocks lifecycle scripts unless the exact resolved tarball URL
      is listed under allowBuilds, and aidos runs a postinstall. The URL is not
      written here because the pin changes on every bump: the installer
      reconstructs the codeload tarball URL from the git spec the same way pnpm
      does, so bumping the pin is the whole upgrade.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [aidos]
    placement: insert
    why: The plugin mounts one row; nothing upstream owns this id.
steps:
  - action: pnpm-add
    spec: "github:xyzshantaram/aidos#fc435af68e384963a8575abd1ddac08e54daaa49"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      aidos runs a postinstall build, so its reconstructed codeload tarball URL
      has to be allow-listed before the install runs or the package lands
      without a dist.
  - action: patch-row
    id: aidos
    name: "@xyzshantaram/aidos"
  - action: copy-tree
    from: profiles/web/node_modules/aidos/skills
    to: skills/aidos
    base: dsh
    why: >
      The skills come from the pinned package's own install, not a repo
      directory and not a separate clone: the pin is the single source of
      identity, and the installed package is exactly that commit. This step
      must run after the pnpm-add step, and it fails loudly if the package
      landed without its skills rather than silently installing nothing.
detect:
  - action: package-installed
    name: "@xyzshantaram/aidos"
  - action: path-exists
    path: skills/aidos
---

# aidos

The ticketing subsystem, pinned to a commit rather than a range: a ticket board
is state a user depends on, and an unpinned upgrade can change the gate rules
under a board that is mid-plan.

## What to check when it goes wrong

An aidos that installs but does nothing usually means its postinstall never
ran, which means the allowBuilds entry did not match. The key is
`<repo-basename>@https://codeload.github.com/<owner>/<repo>/tar.gz/<ref>`, and
pnpm compares it verbatim.

## What must be true before swapping to workspace packages

This pin is v0.1 scaffolding, not a permanent arrangement, and the swap stays
a one-line source change to the `pnpm-add` spec only if all of these hold
first:

- the migrated workspace packages exist under `packages/` in this repository
  and build clean from a fresh clone, with no `file:` overrides hidden in a
  lockfile
- the migrated package's gate semantics are compatible with boards created by
  the pinned version: a board mid-plan must survive the swap without evidence
  or gate-state loss, verified on a copy before a real home is touched
- the pinned commit's skills and the migrated skills no longer diverge, so
  `skills/aidos` needs no separate reconciliation step at swap time
- nothing else in the bundle depends on a pinned-version defect: if a block
  works around a pinned-version bug, the workaround is listed here so the
  swap removes it in the same change
