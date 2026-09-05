---
id: better-markdown
title: streaming markdown renderer
version: 1
rationale: >
  Streaming markdown renderer for assistant output, with Mermaid diagrams,
  KaTeX math and Shiki syntax highlighting. Client-only. Without it those
  blocks render as plain fenced text.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/dsh-better-markdown
    from: "dsh-better-markdown@0.1.2"
    what: the exact npm release of the renderer
steps:
  - action: pnpm-add
    spec: "dsh-better-markdown@0.1.2"
    why: >
      An exact version, not a range, so pnpm resolves the same release every
      time. Widening this to a range turns the pin into a moving target and
      silently changes what renders model output in the page.
detect:
  - action: package-installed
    name: dsh-better-markdown
---

# better-markdown

The only npm-sourced entry in the roster; everything else comes from git or a
tarball. An exact npm version is weaker than a sha — it is a name-to-bytes
promise made by the registry, not content addressing — and the lockfile's
integrity hash is what actually holds it.

## Why the trust question is sharper here

It renders model output into the page, which is the classic injection surface:
a hostile document rendered by a buggy renderer is script running in the
session's own origin. Nobody here has read the code; the exact version pin is
the entire defence. Treat a bump as a new trust decision.

## What to check when it goes wrong

Fenced blocks rendering as plain text means the renderer is not mounted on the
page, not that the install failed — check the client half before reinstalling.
