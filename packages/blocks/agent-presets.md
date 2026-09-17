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
  - path: .agent-presets/thursday/agent.cordis.yml
    from: profiles/thursday/agent.cordis.yml
    what: the Thursday preset composition
  - path: .agent-presets/quick/agent.cordis.yml
    from: profiles/quick/agent.cordis.yml
    what: the Quick preset composition
steps:
  - action: copy-tree
    from: profiles/thursday/agent.cordis.yml
    to: .agent-presets/thursday/agent.cordis.yml
    why: >
      Copied verbatim rather than generated. The composition is reviewed source
      — its row ORDER is load-bearing, with ./aidos-tools.js kept last so the
      aidos-tools plugin reads real tool schemas at assemble time — and a
      generator would have to reproduce that ordering to no benefit.
  - action: copy-tree
    from: profiles/quick/agent.cordis.yml
    to: .agent-presets/quick/agent.cordis.yml
    why: >
      Same reasoning as the Thursday preset. Quick is not a subset produced by
      filtering Thursday: C2's audit assigns every row to BOTH or THURSDAY-ONLY
      by hand, so the two files are independent source.
detect:
  - action: path-exists
    path: .agent-presets/thursday/agent.cordis.yml
    base: home
  - action: path-exists
    path: .agent-presets/quick/agent.cordis.yml
    base: home
  - action: file-contains
    file: .agent-presets/thursday/agent.cordis.yml
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

## Why `.agent-presets/` and not `profiles/`

dsh resolves a preset from `<dshHome>/.agent-presets` plus the roots named in
`agent-presets.roots`, and from the shipped root inside the
`@deepseek-ai/dsh-agent-presets` package. It does NOT scan `profiles/`. Read from
that package at 0.1.5-rc.2: `USER_PRESET_DIR = ".agent-presets"`, mounted as
`dshHomePath(USER_PRESET_DIR)`, with `COMPOSITION_FILE = "agent.cordis.yml"`.

This destination therefore matches the only convention already in live use:
dotfiles-ai installs the aidos preset to `$DSH_HOME/.agent-presets/aidos/`
(sync.sh:814 and :831), and that directory exists on the development machine.

The migration map's `ai-presets` rule says "Settled: presets become profiles"
and records no reasoning for it. The two are different objects: a profile is an
installation root with its own package.json, node_modules and
pnpm-workspace.yaml; a preset is an agent composition. Installing to `profiles/`
produced an install that reported zero problems while `agent-presets.default:
thursday` named a preset no configured root contained.

The SOURCE files stay at `profiles/thursday/` and `profiles/quick/` in the
repository, because that is where C2 and C3 authored them and moving reviewed
source is a separate change from fixing where it is installed.

## What goes wrong

A session starting on the `thursday` preset and behaving like stock dsh means
the composition was never copied: check `profiles/thursday/agent.cordis.yml`
under the Thursday home, not in the repository. The repository copy being
correct is what makes this failure confusing.
