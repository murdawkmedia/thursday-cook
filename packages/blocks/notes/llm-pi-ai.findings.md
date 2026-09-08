# I12 — piloting the block format on `llm-pi-ai`

Artefacts in this directory:

- `llm-pi-ai.md` — the production block. Replaces `packages/install/examples/llm-pi-ai.md`.
- `verify.mjs` — the verification script. Loads the block under the real loader,
  runs six negative controls, composes the block's rows through dsh's own
  `applyEntryPatches`, and diffs them against what `sync.sh` writes.
- `install-engine.mjs` — the engine bundled from `packages/install/src` with the
  repo's own esbuild, so the script imports the real loader rather than a copy.
- `loader-output.txt` — verbatim output of `node verify.mjs`.

Run it with:

    cd /home/sid/repos/thursday/packages/install && node <thisdir>/verify.mjs

(The cwd matters: the script resolves `yaml` and `zod` from that package's
`node_modules`.)

## Verdict

The format survives. The block loads clean, uses no `run`, invents no
constraint, and composes to rows byte-identical to `sync.sh`'s. Three real gaps
were found, none of them fatal, all of them cheap to close.

## Gaps

### 1. No detect action can assert a row is disabled — the important one

`row-present` takes `id`, `name`, `placement` and nothing else. It cannot check
`disabled: true`. So the one fact this whole block exists to guarantee — the
builtin row is OFF — is unverifiable by `detect`. Re-enable the builtin by hand
and detect still passes; the installer skips `steps`; the adapter registers
twice.

This is made worse by dsh's own behaviour: `applyEntryPatches` treats a patch
whose id matches nothing as a *warning*, not an error
(`dsh-app-boot/lib/index.js:92-94`). The failure is silent at both layers.

**Fix:** add an optional `disabled: z.boolean().optional()` to `row-present`'s
shape, honouring `top-level-override`. Three lines. The block's third detect
entry then becomes `row-present {id: llm-pi-ai, placement: override,
disabled: true}` and states the guarantee instead of gesturing at it.

### 2. `top-level-override` is two constraints wearing one name

Its `failureMode` records two independent failures:

- *placement*: dsh-base owns the id, so an insert row kills boot with
  `duplicate loader entry id`.
- *completeness*: `applyEntryPatches` assigns each override key wholesale
  (`target[key] = value`), so an override carrying `config:` must restate every
  default it wants to keep.

This block trips the first and is exempt from the second, because its override
sets only `disabled` and the dsh-base row has no `config:` to lose. A block that
sets `config:` on an override trips both. One name cannot distinguish them, so
a reviewer reading `constraint: top-level-override` on a row cannot tell which
hazard is being claimed, and the loader cannot enforce the second at all.

**Fix (optional, defer with eyes open):** split out
`wholesale-override-config`, honoured by `patch-row` only, declarable only when
the step carries both `placement: override` and a `config:`. That last part is
checkable at load: an override `patch-row` with a `config` and no such
constraint is exactly the silent-default-dropping bug, and the loader could
refuse it.

### 3. No field for "this block does nothing until another block supplies data"

Installing the fork changes no request. It only makes
`sendSessionAffinityHeaders` *settable*; a provider profile in `settings.yaml`
must then set it. `dependsOn` is ordering and points the wrong way — the block
that writes settings (`thursday-defaults`) depends on this one, not the reverse.

Recorded as a `sideEffects` entry, which is where the schema says awkward facts
go. Correct per the schema's own comment, and a mild schema bug report as that
comment predicts. Not worth a field for one occurrence; worth one if a second
block needs it.

## The existing example was not adequate

`packages/install/examples/llm-pi-ai.md` loads and composes to the right rows,
so it is not wrong. It is thin in five ways:

1. Its `rationale` — the field `thursday status` prints — says "a vendored
   fork ... adds provider affinity" but never names
   `sendSessionAffinityHeaders`, never says the switch is a module-level compat
   gate rather than a setting, and so never answers *why it must be a fork*. The
   body says "so a model request routes to the provider that actually serves
   it", which is wrong: affinity is about keeping one session pinned to one
   upstream for cache hits, not about routing correctness.
2. `detect` has one entry, checking only the insert row. It never checks the
   package is installed and never mentions the override row, so a half-installed
   state reads as installed.
3. No `modifies`. The install writes `profiles/web/package.json`, which is dsh's
   file, not this block's.
4. No `sideEffects`. The two facts above — shadowing a builtin by name, and
   being inert until settings supply a profile — are unrecorded.
5. It calls the fork "linked into the web profile under the same package name"
   without saying that this is resolution shadowing rather than an alias, which
   is precisely the distinction that decides whether `pnpm-add` needs `as:` and
   `alias-install-name`. It does not: the vendored package's own name IS the
   builtin's name. The compaction block is the aliased case; this one is not.
   Conflating them would have put a wrong constraint on a step.

Note that `tests/sync-facts.test.ts` asserts against this example by index —
`piAi.frontmatter.dshConfig[1]` and
`constraintsNamed(piAi, "top-level-override").map(c => c.where)` equalling
`["dshConfig[1]", "steps[2]"]`. The replacement block preserves both positions,
so the test passes unchanged. Verified: `dshConfig[1]` is the override row and
the surfaced constraint locations are exactly `dshConfig[1]` and `steps[2]`.

## Known format gaps, recorded and deferred

The pilot surfaced four gaps beyond the ones closed above. None is fixed in
the schema; all four are recorded here so the pilot's honesty is complete and
the follow-up work has a list:

1. **Cross-package denial expression.** The schema has no field for one
   package denying a tool another package in the same bundle registers
   (the dsh-toolkit monorepo hazard). Today it lives as prose in the block,
   which nothing checks.
2. **Pin-weakness declaration.** A pin that names a moving ref (a branch, or
   `main`) cannot be flagged in frontmatter; at-file is the live example.
   The schema treats every spec as equally pinned.
3. **Roster trust metadata.** No frontmatter field carries trust tier or
   last-reviewed date, which I14's supply-chain lens will want per block
   rather than per roster entry.
4. **Copy-file action.** Single-file copies abuse `copy-tree`; a `copy-file`
   action with content-compare idempotence (the tree action's, minus the
   recursion) is the shape. agents-md.md's step wishes aloud for it.

Each becomes a real ticket when a second block needs it; until then this
section is their home.
