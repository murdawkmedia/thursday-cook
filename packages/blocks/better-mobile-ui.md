---
id: better-mobile-ui
title: Better mobile UI
version: 1
rationale: >
  Makes the web UI usable on a phone: touch-sized targets and a layout that
  survives a narrow viewport. Client-plane only. It is what makes reaching the
  app remotely from a phone worth having at all.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/dsh-plugin-better-mobile-ui
    from: "github:davidgereb/dsh-plugin-better-mobile-ui#16e21548315866b50d5f3f64b91a70f24f3318ba"
    what: the pinned mobile UI plugin
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [ui-better-mobile]
    placement: insert
    why: >
      The package does not self-mount, so the profile mounts it. The row id
      and the package name differ deliberately: the id names what the row is
      for, and nothing upstream claims it.
steps:
  - action: pnpm-add
    spec: "github:davidgereb/dsh-plugin-better-mobile-ui#16e21548315866b50d5f3f64b91a70f24f3318ba"
  - action: patch-row
    id: ui-better-mobile
    name: dsh-plugin-better-mobile-ui
detect:
  - action: package-installed
    name: dsh-plugin-better-mobile-ui
  - action: row-present
    id: ui-better-mobile
---

# better-mobile-ui

Third-party, pinned to a full sha, and unread: it restyles the whole app in the
page, which is as much authority as a client-plane plugin can have. The pin is
the only thing holding it, so bumping it is a new decision rather than an
update.

## What breaks without it

Nothing fails. The desktop layout simply arrives on a phone, where the targets
are too small to hit and the composer is unusable.
