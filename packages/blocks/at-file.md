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
    from: "https://github.com/omdsh-dev/dsh-at-file/archive/da602d1a8f1b417b8a1d8d4059e0f4cb1c353524.tar.gz"
    what: the commit-sha tarball of at-file 0.7.0 (upstream da602d1)
steps:
  - action: pnpm-add
    spec: "https://github.com/omdsh-dev/dsh-at-file/archive/da602d1a8f1b417b8a1d8d4059e0f4cb1c353524.tar.gz"
    why: >
      A commit-sha tarball, not a tag URL and not a github: git spec. The sha
      is the pin: GitHub's archive service generates this tarball from that
      exact commit, so the bytes cannot move under it. Do not "simplify" the
      spec to a tag or a branch — the tag route was the roster's weakest pin
      and is recorded below as history, not as an option.
detect:
  - action: package-installed
    name: dsh-at-file
---

# at-file

## Pinned by commit SHA (was: the weakest pin in the roster)

Until 2026-10-06 this was installed from `archive/refs/tags/v0.6.7.tar.gz` —
a MOVABLE tag with no integrity hash, and the roster itself called it the one
entry whose pin does not hold. The move to a commit-sha tarball
(`archive/da602d1….tar.gz`) ends that: the bytes are fixed by the commit, and
the same decision brought the dsh-0.1.5 boot fix along (below).

The treatment decision, recorded so it is not re-litigated on every bump:
pin the upstream fix rather than fork or vendor. Upstream HEAD already carries
the exact two-line fix; a fork would buy a permanent re-check obligation
(re-diffing a fork on every dsh upgrade) for a delta that exists upstream, and
vendoring is unjustified for a client-plane affordance with no local delta.

## Why this version: the dsh 0.1.5 boot fix

dsh-settings removed the `settingsNamespace` free function (0.1.2-era; gone
from 0.1.5-rc.3 exports), and v0.6.7 imports it — on a 0.1.5 runtime the
plugin dies at load with "does not provide an export named
'settingsNamespace'". Upstream `da602d1` ("stop importing the removed settings
namespace value") fixes exactly that: `AT_FILE_NAMESPACE` is now the plain
branded string and `ctx.settings.register` takes it directly. Verified in the
pinned bytes at pin time: zero `settingsNamespace` references in `src/` and
`lib/`, and the bundle registers `"at-file"` through the new shape.

VERIFY BYTES AT EVERY BUMP, and not by trusting the URL: on 2026-10-06
GitHub's raw-file surface still served the OLD `src/settings.ts` even after
the fix commit landed (CDN/mirror lag). The archive tarball was correct; the
raw endpoints lied. Always download the tarball and grep it before moving the
pin.

## What to check when it goes wrong

The retag failure mode is gone with the sha pin. What remains: upstream
rewriting or force-pushing `da602d1` itself (the archive would 404 or change —
loud, not silent), and the general class of "behaviour changed at an unchanged
version": this package's `package.json` says 0.7.0 while the nearest tags are
v0.6.8/v0.6.9, so version numbers are not identifiers here — the sha is.

## Why this block exists at all

This block landed 2026-10-06 with the pin fix. Before it, `dsh-at-file` was
roster-only: the install engine plans steps from `packages/blocks/*.md` and
never reads `config/plugin-roster.json`, so a fresh install never installed
it (the live home got it from the predecessor `dotfiles-ai/sync.sh`). A
roster entry alone installs nothing; the block is the install surface.
