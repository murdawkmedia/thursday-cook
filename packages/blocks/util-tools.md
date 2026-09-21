---
id: util-tools
title: util tool set (six pinned repos)
version: 1
rationale: >
  Six host-plane tools, installed as six separate pinned repos: calculator
  (arithmetic evaluated exactly instead of guessed by the model), diff
  (in-memory text/JSON/CSV/Markdown diffing without temp files), time (real
  clock and timezone arithmetic), regex (patterns tested against sample input
  before use), markdown (structured heading-tree editing instead of string
  surgery), and encoding (base64/hex/URL/JSON done exactly). They travel in
  ONE block because of one shared hazard: they must never be replaced by the
  omdsh-dev/dsh-toolkit monorepo, which also registers calculator and diff —
  already installed here as their own repos — and would double-register both.
  The apparent redundancy of six pins is the fix, not an oversight. Four of
  the six (time, regex, markdown, encoding) are the tools the `util` skill
  gates.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tools
    from: "@deepseek-ai/dsh-tools"
    what: the pinned dsh-tools anchor every tool step below resolves against
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-calculator
    from: "github:omdsh-dev/dsh-tool-calculator#05090e946113721c5295518cc20e74f427022c55"
    what: the pinned calculator tool package
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-diff
    from: "github:omdsh-dev/dsh-tool-diff#d4afd6e2de0b411151fefc60adebd0973373ec10"
    what: the pinned diff tool package
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-time
    from: "github:omdsh-dev/dsh-tool-time#8b7a2137f516f9d9179663f5aa58928034c90377"
    what: the pinned time tool package
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-regex
    from: "github:omdsh-dev/dsh-tool-regex#5afda86cd6862a25f6684056b378c330a5aa86b3"
    what: the pinned regex tool package
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-markdown
    from: "github:omdsh-dev/dsh-tool-markdown#267871b115c49c5cde072d05d0d2cef6982ae8f8"
    what: the pinned markdown tool package
  - path: profiles/web/node_modules/@deepseek-ai/dsh-tool-encoding
    from: "github:omdsh-dev/dsh-tool-encoding#dbf829b5a755d27ed64a146a4bfa50a62f985f6c"
    what: the pinned encoding tool package
steps:
  - action: pnpm-add
    spec: "@deepseek-ai/dsh-tools@0.1.0-rc.8"
    why: >
      Anchor for the six dsh-tool-* adds below. Upstream's `latest` dist-tag
      for @deepseek-ai/dsh-tools is stale (0.0.1-rc.1) while the usable
      releases sit on `next`/`alpha`, so a fresh profile resolves the tools'
      dependency range against nothing and all six adds fail. Installing the
      pin FIRST puts a matching version in the web profile, which anchors
      resolution for the six github adds. The version lives HERE ONLY — the
      six steps below must not repeat it, so a bump is one edit.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-calculator#05090e946113721c5295518cc20e74f427022c55"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, not a toolkit collection. Do NOT swap this step for the
      omdsh-dev/dsh-toolkit monorepo: that collection also registers
      calculator and diff, which the two steps after this install as their own
      repos, and mounting it double-registers both tools.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-diff#d4afd6e2de0b411151fefc60adebd0973373ec10"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, same hazard as calculator: the toolkit monorepo also
      registers diff and would double-register it against this package.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-time#8b7a2137f516f9d9179663f5aa58928034c90377"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, NOT the omdsh-dev/dsh-toolkit monorepo: that collection
      also registers calculator and diff, already installed by the two steps
      above, and would double-register them. The four remaining pins look
      redundant; they are the fix.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-regex#5afda86cd6862a25f6684056b378c330a5aa86b3"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, NOT the toolkit monorepo — see the time step: the
      collection also registers calculator and diff and would double-register
      them.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-markdown#267871b115c49c5cde072d05d0d2cef6982ae8f8"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, NOT the toolkit monorepo — see the time step: the
      collection also registers calculator and diff and would double-register
      them.
  - action: pnpm-add
    spec: "github:omdsh-dev/dsh-tool-encoding#dbf829b5a755d27ed64a146a4bfa50a62f985f6c"
    allowBuilds: true
    constraint: needs-allow-builds
    why: >
      Its own repo, NOT the toolkit monorepo — see the time step: the
      collection also registers calculator and diff and would double-register
      them.
detect:
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-calculator"
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-diff"
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-time"
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-regex"
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-markdown"
  - action: package-installed
    name: "@deepseek-ai/dsh-tool-encoding"
---

# util-tools

Six third-party packages, each pinned to a full sha and never read by anyone
here. Each registers a host-plane tool, so each can do anything the DSH
process can; the skill gate hides the four util-gated tools (time, regex,
markdown, encoding) until the util skill loads, but does not sandbox them. The
pins are the only thing holding any of them, so a bump is a new trust
decision, not an update.

## Why one block, and why not one repo

They share a single decision, and the decision is the hazard: DO NOT
consolidate these into the omdsh-dev/dsh-toolkit monorepo. That collection
also registers calculator and diff, which the first two steps install as their
own repos, and mounting it double-registers both. config/plugin-roster.json's
`excluded` section records the same verdict for `omdsh-dev/dsh-toolkit`. No
constraint name in the closed registry expresses "never install this other
package", so the step `why`s and this paragraph are where the rule lives.
Grouping the six in one block keeps the rule and the set together: removing
one tool means editing this block's pin list deliberately, and deleting the
block removes all six at once rather than leaving a half-set whose missing
members look like an oversight.

## What to check when it goes wrong

Two `calculator` or two `diff` tools in the tool list means the toolkit
monorepo got added alongside this block. Remove the monorepo, never one of
these six packages. A missing tool from the four util-gated ones is more
likely the skill gate than the install — check the gate before reinstalling.
