---
id: agent-presets
title: The Thursday and Quick agent presets
version: 1
rationale: >
  The two agent-plane compositions Thursday ships: `thursday`, the full
  environment with aidos planning and ticketing, and `quick`, the same agent
  without the long-horizon ceremony. Both files were built by C2 and C3 and,
  until this block existed, NOTHING INSTALLED THEM: the repository held
  profiles/thursday/agent.cordis.yml and profiles/quick/agent.cordis.yml while
  a real install put nothing under profiles/ except web. Found on 2026-09-16 by
  running the installer against a throwaway home. Delete this block and
  `agent-presets.default: thursday` in settings.yaml names a preset that is not
  on disk.
dependsOn: [dsh-runtime, thursday-defaults]
installs:
  - path: profiles/thursday/agent.cordis.yml
    from: profiles/thursday/agent.cordis.yml
    what: the Thursday preset composition
  - path: profiles/quick/agent.cordis.yml
    from: profiles/quick/agent.cordis.yml
    what: the Quick preset composition
steps:
  - action: copy-tree
    from: profiles/thursday/agent.cordis.yml
    to: profiles/thursday/agent.cordis.yml
    why: >
      Copied verbatim rather than generated. The composition is reviewed source
      — its row ORDER is load-bearing, with ./aidos-tools.js kept last so the
      aidos-tools plugin reads real tool schemas at assemble time — and a
      generator would have to reproduce that ordering to no benefit.
  - action: copy-tree
    from: profiles/quick/agent.cordis.yml
    to: profiles/quick/agent.cordis.yml
    why: >
      Same reasoning as the Thursday preset. Quick is not a subset produced by
      filtering Thursday: C2's audit assigns every row to BOTH or THURSDAY-ONLY
      by hand, so the two files are independent source.
detect:
  - action: path-exists
    path: profiles/thursday/agent.cordis.yml
    base: home
  - action: path-exists
    path: profiles/quick/agent.cordis.yml
    base: home
  - action: file-contains
    file: profiles/thursday/agent.cordis.yml
    text: "dsh-persona"
    base: home
---

# agent-presets

## Why detection checks for the persona row

`path-exists` alone would call this block installed as soon as a file with the
right name appeared, including a half-copied one. The `file-contains` check
names `dsh-persona` because that row is the first thing in both compositions
and is the row most likely to be missing from a stale copy: it carries a
`prefix` that is `z.string().required()`, and before 2026-09-16 both files
mounted the row with no config at all. A preset missing it fails to mount.

## What goes wrong

A session starting on the `thursday` preset and behaving like stock dsh means
the composition was never copied: check `profiles/thursday/agent.cordis.yml`
under the Thursday home, not in the repository. The repository copy being
correct is what makes this failure confusing.
