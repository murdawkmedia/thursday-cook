---
id: llm-pi-ai
title: llm-pi-ai (vendored session-affinity fork)
version: 1
rationale: >
  A vendored fork of the dsh pi-ai adapter that moves sendSessionAffinityHeaders
  from "withhold" to "offer" in the anthropic-messages compat gate, so a
  provider profile can ask for session-affinity headers and a session's requests
  keep landing on the same upstream instead of scattering across the pool and
  missing the provider cache. The stock builtin withholds that switch and cannot
  be configured into offering it. The fork installs under the builtin's own
  package name, mounts as its own composition row, and the builtin row is
  disabled: it is the only pi-ai adapter registrar in a Thursday install.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/@deepseek-ai/dsh-llm-pi-ai
    from: packages/plugins/llm-pi-ai
    what: >
      the vendored adapter, linked into the web profile under the builtin's own
      package name so the profile resolves the fork rather than the copy that
      ships with the dsh install
modifies:
  - file: profiles/web/package.json
    why: >
      pnpm writes the dependency into the web profile's manifest, which is dsh's
      file and not this block's. The dependency key is the builtin's own package
      name deliberately: nothing renames it, and a later plain `pnpm install` in
      that profile has to keep resolving the vendored path rather than falling
      back to the registry copy of the builtin.
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [llm-pi-ai-affinity]
    placement: insert
    why: >
      The fork mounts under an id nothing upstream owns, which is what keeps the
      llm-pi-ai id free for the override row below. Taking a new id rather than
      editing the builtin row is what makes disable-and-replace two independent
      rows instead of one edit that has to be both at once.
  - file: profiles/web/cordis.patch.yml
    rows: [llm-pi-ai]
    placement: override
    constraint: top-level-override
    why: >
      dsh-base already owns the llm-pi-ai id (dsh-base/cordis.patch.yml:95), so
      switching it off has to be a top-level override row rather than a child of
      the insert list; a second row with that id kills boot with "duplicate
      loader entry id: llm-pi-ai". This override sets only `disabled`, and the
      base row carries no `config:` of its own, so applyEntryPatches assigning
      each override key wholesale (target[key] = value, dsh-app-boot/lib/
      index.js:100-103) drops nothing here. The hazard is latent, not absent:
      the moment this row needs a `config:`, that one key replaces the whole
      base config object and must restate every default it wants to keep.
sideEffects:
  - what: >
      Installing the fork changes no request on its own. It only makes
      sendSessionAffinityHeaders settable; a pi-ai provider profile must then
      set compat.sendSessionAffinityHeaders on an anthropic-messages route
      before anything differs on the wire. thursday-defaults writes that profile.
    where: settings.yaml
    why: >
      "Installed" and "working" are different questions for this block, and
      detect can only answer the first. Recorded here because no frontmatter
      field expresses "a later block must supply data for this one to do
      anything": dependsOn is ordering and points the other way, since
      thursday-defaults depends on this block.
    undoneByRemovingHome: true
  - what: >
      Shadows the dsh builtin @deepseek-ai/dsh-llm-pi-ai for the web profile by
      installing under that exact package name.
    where: profiles/web/node_modules/@deepseek-ai/dsh-llm-pi-ai
    why: >
      Resolution, not aliasing: the vendored package's own name IS the builtin's
      name, so the profile's node_modules wins over the host base copy with no
      rename and no `as:`. Re-check on every dsh upgrade, because the fork is
      cut from 0.1.0-rc.8 and a dsh bump can move the builtin out from under it
      or rename its composition row, and a renamed row makes disable-row a
      silent no-op that leaves two registrars running.
    undoneByRemovingHome: true
steps:
  - action: pnpm-add
    spec: "./packages/plugins/llm-pi-ai"
    profile: web
  - action: patch-row
    id: llm-pi-ai-affinity
    name: "@deepseek-ai/dsh-llm-pi-ai"
    placement: insert
  - action: disable-row
    id: llm-pi-ai
    constraint: top-level-override
    why: >
      The builtin row must go off while the fork is installed, or two registrars
      claim one provider name and the adapter registers twice. It is written as
      a top-level override because dsh-base owns the id and a second row with it
      kills boot on a duplicate loader entry id.
detect:
  - action: package-installed
    name: "@deepseek-ai/dsh-llm-pi-ai"
    profile: web
  - action: row-present
    id: llm-pi-ai-affinity
    name: "@deepseek-ai/dsh-llm-pi-ai"
    placement: insert
  - action: row-present
    id: llm-pi-ai
    placement: override
    disabled: true
---

# llm-pi-ai

The pilot block for the format (I12), and the block that exercises the fiddliest
thing in the composition: a vendored fork that has to mount as its own row while
the builtin row of the same name goes off.

## What the fork changes

One entry in one table. `COMPAT_GATES["anthropic-messages"]` in `lib/index.js`
lists `sendSessionAffinityHeaders: "offer"`; the builtin lists it under
`COMPLETIONS_COMPAT_GATE` as `"withhold"` and gives the anthropic-messages gate
no entry at all. "Withhold" means the adapter refuses the field even when a
provider profile sets it, so the switch is unreachable from settings and the
builtin cannot be configured into affinity. Everything else in the package is
the rc.8 builtin, unmodified.

## Why it is a fork and not a config

There is no config. The gate is a module-level constant read during profile
resolution, not a setting, so the only way to offer the field is to ship
different bytes.

## Why the builtin row is disabled

The vendored package carries the builtin's own name, so the web profile's
`node_modules` shadows the copy in the dsh install. Both composition rows —
`llm-pi-ai` from dsh-base and `llm-pi-ai-affinity` from this block — would then
resolve to the same fork and register the adapter twice for one provider name.
Disabling the builtin row leaves exactly one registrar.

The disable has to be a top-level override row. dsh-base owns the `llm-pi-ai`
id, and the loader's group update throws `duplicate loader entry id: llm-pi-ai`
before anything mounts if a second row with that id appears in the insert list.
That is a hard boot failure, not a warning.

## What breaks without it

Nothing at boot. Requests scatter across the upstream pool, the provider cache
misses, and the symptom is latency and cost rather than an error. With the
builtin row left enabled the failure is louder: the adapter registers twice for
one provider name.

## What to check when it goes wrong

Boot failing with `duplicate loader entry id: llm-pi-ai` means the override row
moved into the insert list.

The adapter registering twice means the `llm-pi-ai` override row is missing or
has been re-enabled. Note that `disable-row` cannot detect this: a patch whose
id matches nothing only *warns* and is skipped
(`dsh-app-boot/lib/index.js:92-94`). That is why the third detect entry is
`row-present` with `disabled: true`: it is the one check that fails when the
override row is missing outright or has been re-enabled by hand.

Affinity headers never appearing on the wire, with the fork correctly
installed, means no provider profile asks for them: check
`llm-pi-ai.providers.<name>.compat.sendSessionAffinityHeaders` in
`settings.yaml`, which the thursday-defaults block owns.

Every pi-ai provider disappearing at once is a different fault entirely — the
settings file took a full YAML round-trip somewhere and `off:` became `false`.
See the thursday-defaults block and the `no-yaml-round-trip` constraint.

## On upgrading dsh

The fork is cut from `0.1.0-rc.8` and shadows a builtin that moves with dsh.
Two things have to be re-checked on every dsh bump: that the builtin's
composition row is still called `llm-pi-ai` (a rename turns the disable into a
silent no-op and puts two registrars back), and that the rc the fork is cut from
is still close enough to the builtin it shadows.
