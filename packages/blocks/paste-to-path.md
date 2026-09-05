---
id: paste-to-path
title: paste-to-path
version: 1
rationale: >
  Paste-to-path: a pasted file lands under <workspace>/.dsh/pastes/ and the
  composer carries a PATH reference instead of an inline blob, so the agent
  reads the file with its own tools. Replaced the earlier dsh-paste-input
  plugin, which must not be reinstalled alongside it.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/dsh-paste-to-path
    from: "github:Johnny-xuan/dsh-paste-to-path#d68fb104ca25a663ba3912bb17f8c2ab32d60e37"
    what: the pinned paste-to-path plugin
sideEffects:
  - what: >
      Pasting a file into the composer writes it into the current workspace,
      under .dsh/pastes/.
    where: "<workspace>/.dsh/pastes/"
    why: >
      That is the whole point of the plugin: the message carries a path the
      agent can read with its own tools, so the write is the feature and
      cannot be avoided while keeping the feature.
    undoneByRemovingHome: true
steps:
  - action: pnpm-add
    spec: "github:Johnny-xuan/dsh-paste-to-path#d68fb104ca25a663ba3912bb17f8c2ab32d60e37"
detect:
  - action: package-installed
    name: dsh-paste-to-path
---

# paste-to-path

Third-party, pinned to a full sha, never read. It writes files into the
workspace on a paste, so it holds a write path triggered by ordinary UI input.

## The pinned fork needs a local modification

The stock client registers its paste picker in the `conversation.input.left`
slot; dotfiles-ai's `sync.sh` regex-rewrites the installed `client.js` to move
it to `conversation.input.right` (order -100). That edit survives in Thursday
— the button placement is a real requirement — but it now patches this
profile's own copy inside the Thursday home, so it belongs to this block, not
to a shell step. The block must apply the same rewrite after `pnpm-add`, and
`thursday status` must treat a client.js that still says
`conversation.input.left` as drift. If the fork ever lands the placement
upstream, drop the rewrite and record that here.

## Do not install dsh-paste-input alongside it

This plugin supersedes `dsh-paste-input`, the earlier take on the same
problem; the two do the same job and would compete for the paste. The roster's
excluded section records the same verdict. If both appear in the profile, keep
this one and remove the old one.

## What to check when it goes wrong

A paste arriving as an inline blob again usually means the client half did not
mount; the package being in node_modules proves nothing about the page.
Pastes accumulating under .dsh/pastes/ are expected and are workspace files,
not Thursday-home state.
