---
id: thursday-plugins
title: Thursday's own look and feel
version: 1
rationale: >
  The four plugins Thursday ships rather than inherits: the skin, the mark, the
  working-indicator phrases, and the bundled typography. They are separate from
  workspace-plugins because those are migrated from dotfiles-ai and these are
  native to this repository, and because deleting this block should remove
  Thursday's appearance without touching a single inherited affordance.

  Each is a workspace package installed from a path, linked rather than
  fetched, and each mounts its own row from its own cordis.patch.yml, so this
  block writes no composition rows. Until this block existed all four were
  built, tested and inert: installed by nothing, mounted by nothing, and
  therefore never loaded. dsh served the dolphin.
dependsOn: [dsh-runtime, host-plane]
installs:
  - path: profiles/web/node_modules/@trythursday/thursday-skin
    from: packages/plugins/thursday-skin
    what: rebinds dsh's theme variables to the Thursday tokens
  - path: profiles/web/node_modules/@trythursday/thursday-mark
    from: packages/plugins/thursday-mark
    what: the Thursday mark in dsh's brand slots, and the favicon and web app manifest
  - path: profiles/web/node_modules/@trythursday/thursday-thinking
    from: packages/plugins/thursday-thinking
    what: the working-indicator phrases and the animated mark beside them
  - path: profiles/web/node_modules/@trythursday/thursday-fonts
    from: packages/plugins/thursday-fonts
    what: Literata, Inter and Fantasque Sans Mono, bundled rather than fetched
steps:
  - action: pnpm-add
    spec: ./packages/plugins/thursday-skin
    why: >
      Installed from a path so the workspace package is linked rather than
      fetched. The skin carries no host behaviour; its row exists only so the
      client-module registry finds the bundle.
  - action: pnpm-add
    spec: ./packages/plugins/thursday-mark
    why: >
      The only one of the four with a real host half: it serves the favicon,
      the icon set and the manifest over the web server's exact routes, which
      cannot be done from the browser.
  - action: pnpm-add
    spec: ./packages/plugins/thursday-thinking
    why: >
      Replaces dsh's "Deep diving..." indicator. Its phrase set is data, so a
      phrase can be added without touching this block or the package.
  - action: pnpm-add
    spec: ./packages/plugins/thursday-fonts
    why: >
      Bundles the three faces rather than fetching them, so a machine with no
      network renders the intended typography.
detect:
  - action: package-installed
    name: "@trythursday/thursday-skin"
  - action: package-installed
    name: "@trythursday/thursday-mark"
  - action: package-installed
    name: "@trythursday/thursday-thinking"
  - action: package-installed
    name: "@trythursday/thursday-fonts"
---

# Thursday's own look and feel

## Why these are a block of their own

`workspace-plugins` holds eleven packages migrated from `dotfiles-ai`. These
four were written here. Keeping them apart means uninstalling Thursday's
appearance is one block removal that cannot disturb an inherited panel, and it
means the migration blocks stay a faithful record of what came from where.

## What was wrong before it existed

All four packages were built, tested, and referenced by nothing. `pnpm run
build:plugins` produced their bundles, their test suites passed, and no install
step put them anywhere — so a Thursday install rendered as stock dsh, dolphin
included. The lesson is that a plugin is not shipped when it builds; it is
shipped when something installs it and something mounts it.

## The host half that does nothing

Three of these four carry a `src/index.ts` whose entire body is an empty
`apply()`. dsh's client-module registry only discovers a package's `dsh.client`
entry if the package mounts a row on the host plane, so a client-only plugin
still needs a host half whose only job is to be found. Deleting it as dead code
silently unloads the plugin, which is why it says so in its own header.
