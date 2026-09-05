---
id: session-search
title: cross-session search
version: 1
rationale: >
  Searches past DSH session logs, so a decision made in an earlier session can
  be found again instead of being re-derived. Paired with the `session-search`
  skill, which documents how to drive it.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/@dsh-external/dsh-session-search
    from: "github:Tieboyh/dsh-session-search#82990a0e9804"
    what: the pinned session-search plugin
steps:
  - action: pnpm-add
    spec: "github:Tieboyh/dsh-session-search#82990a0e9804"
detect:
  - action: package-installed
    name: "@dsh-external/dsh-session-search"
---

# session-search

Third-party, pinned to an abbreviated sha, never read. It reads every stored
session transcript, which is the most sensitive data on the host, so a bump is
a new trust decision. Expand the sha to its full 40 characters on the next
bump.

## The name is not derivable from the repo

The install spec says `Tieboyh/dsh-session-search`, but the package's own name
— and therefore the dependency key in the web profile — is
`@dsh-external/dsh-session-search`, a scope the repo name gives no hint of.
This is not an alias in the deliberate sense; the name simply does not follow
the repo. Any extra-plugin check or removal command must use the scoped name:
`dsh plugin --profile web remove @dsh-external/dsh-session-search`.

## What to check when it goes wrong

A search that finds nothing when sessions obviously exist usually means a
second copy installed under the repo-derived name is shadowing the real one.
Remove the wrongly-named copy, not the scoped one.
