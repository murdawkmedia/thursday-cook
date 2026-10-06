---
id: input-history
title: composer input history
version: 1
rationale: >
  Recall previously sent messages in the composer with the up arrow, the way a
  shell history works. Without it the composer starts empty every time and a
  long prompt typed once cannot be retrieved or edited.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/dsh-input-history
    from: "github:sunshaobei/dsh-input-history#7f5ce21fd004b708bcd7d6b6b4521c4d3923371a"
    what: the pinned input-history plugin
steps:
  - action: pnpm-add
    spec: "github:sunshaobei/dsh-input-history#7f5ce21fd004b708bcd7d6b6b4521c4d3923371a"
detect:
  - action: package-installed
    name: dsh-input-history
---

# input-history

Third-party single-author repo, pinned to an abbreviated sha, never read. It
runs in the page with access to everything typed into the composer, which is
the most direct view of the user's intent there is.

## The pin, and no composition row

The pin is a content-addressed short sha, so the bytes cannot change, but an
abbreviation can in principle become ambiguous as the repo grows; expand it to
the full 40-character sha on the next bump — the source script's own header
already says to always use the full sha. No patch row exists for this plugin
anywhere in the web composition: it self-mounts, and adding a row would need
an id the plugin does not already claim.

## What to check when it goes wrong

The up-arrow doing nothing is a client-side mount failure, not an install
failure: the package being present in node_modules proves nothing about the
page half.
