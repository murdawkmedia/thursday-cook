---
id: at-file
title: "'@' file references in the composer"
version: 1
rationale: >
  The `@` file-reference affordance in the composer: type @ and pick a path,
  and the message carries a real file reference the agent can read instead of
  a pasted excerpt.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/dsh-at-file
    from: "https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.7.tar.gz"
    what: the tagged release tarball of the at-file plugin
steps:
  - action: pnpm-add
    spec: "https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.7.tar.gz"
    why: >
      The spec is a release tarball rather than a git spec — the roster's only
      tarball entry — and it is kept verbatim from the source script. Do not
      "simplify" it to a github: spec without changing the pin decision
      recorded below.
detect:
  - action: package-installed
    name: dsh-at-file
---

# at-file

## The weakest pin in the roster

The pin is a git tag, and a tag is a movable pointer: the upstream author can
retag v0.6.7 at different bytes and this install silently changes. There is no
integrity hash on the tarball either, so nothing here guarantees the bytes the
way a sha does. This is the one entry where the pin itself does not hold; a
bump is mandatory re-evaluation, not an update. On the next bump, replace the
URL with a commit-sha tarball (`archive/<sha>.tar.gz`) or a git spec pinned to
a sha.

No closed-registry constraint expresses "this pin is weaker than it looks", so
this prose is where the hazard lives. The install must stay byte-identical to
the roster's `installSpec` — same tag, same URL — until that decision is made.

## What to check when it goes wrong

A changed behaviour at an unchanged version number is the tag having been
retagged upstream. Diff against a fresh download of the same URL, then move to
a sha pin so it cannot happen again.
