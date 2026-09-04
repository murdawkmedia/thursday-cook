---
id: remote
title: Remote access authentication
version: 1
rationale: >
  Remote-access authentication. dsh serves its settings RPCs loopback-only, so
  every browser reaching the app through a proxy gets inert, empty settings
  scopes without this plugin: the settings UI loads and does nothing.
  Installing it is what makes non-loopback use work at all. It is also the
  authentication boundary — it owns the session cookie, the account list and
  the rate limiter.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/@xgone/dsh-remote
    from: "github:xyzshantaram/dsh-remote#0c9e708c2b5c"
    what: the pinned fork of the remote-auth plugin
integrations:
  - name: remote-browser-access
    kind: service
    requiresCredentials: true
    why: >
      The account store it creates holds credentials the user supplies. They
      live under the Thursday home, so removing the home removes them, but the
      accounts they grant access to are the user's own.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [remote]
    placement: override
    constraint: top-level-override
    why: >
      The plugin mounts its own remote row from its own bundle patch, so this
      composition supplies configuration only. It MUST be a top-level override
      row and never a child of the insert list: an insert row with the same id
      kills boot with "duplicate loader entry id: remote".
steps:
  - action: pnpm-add
    spec: "github:xyzshantaram/dsh-remote#0c9e708c2b5c"
  - action: patch-row
    id: remote
    placement: override
    constraint: top-level-override
    config:
      enabled: true
      debug: true
      accounts: []
      secret: ""
      session:
        cookieName: dsh_session
        ttlSeconds: 604800
        secure: true
        sameSite: lax
      enforceRoles: true
      rateLimit:
        maxAttempts: 5
        windowMs: 900000
      files:
        roots:
          - /tmp/dsh
    why: >
      Every key the plugin's own patch sets is repeated here because the
      override is assigned wholesale, not merged: a key left out is not
      inherited, it is deleted. secure is true because the proxy terminates
      TLS, so the cookie may carry Secure. debug registers a trace endpoint
      that writes client trace lines to the server journal; keep it false
      unless a remote-mode fault is being debugged.
detect:
  - action: package-installed
    name: "@xgone/dsh-remote"
  - action: row-present
    id: remote
    placement: override
---

# remote

The worked example of wholesale override assignment, and the reason the rule is
written down at all.

## The rule

`applyEntryPatches` ends with `target[key] = value` for every key of the
override. It does not deep-merge. An override that supplies `config:` therefore
replaces the plugin's entire `config:` block — so a config override that sets
one field and omits the rest does not set one field, it deletes six.

Two values here differ from the plugin's own defaults: `session.secure` and
`debug`. Everything else in the block is the plugin's default, restated so it
survives. The generator checks that restatement against the plugin's own patch
file and refuses to write a composition that drops one.

## Two additions

`debug` and `files` are not defaults at all: the plugin's patch has neither, so
this composition adds them. The generated file says which of the two it is for
every value, because "differs from the default" and "the plugin has no such
default" fail in different ways when the plugin changes.

## What to check when it goes wrong

Boot dying with "duplicate loader entry id: remote" means the row moved into
the insert list. Sessions dropping on every restart means the override lost
`secret`, so a new signing secret is generated each time. Roles ignored means
it lost `enforceRoles`.
