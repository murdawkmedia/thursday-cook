---
id: aidos
title: aidos (planning and ticketing)
version: 1
rationale: >
  Thursday's planning and ticketing subsystem: tickets, evidence gates, and the
  plan format. Installed from git at a pinned commit, and it builds on install.
dependsOn: [dsh-runtime]
installs:
  - path: skills/aidos
    from: packages/aidos/skills
    what: the aidos skills, synced from the pinned commit
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
    from: packages/aidos/skills
    to: skills/aidos
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
