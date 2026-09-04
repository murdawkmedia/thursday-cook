# The block format

I11. What a Thursday install block physically is, decided before I1 fixes the
schema around it.

## The decision

A block is one markdown file: YAML frontmatter for the data, prose for the
reasons, and named actions for the steps. Literate programming, with the shape
GitHub Actions made familiar.

The steps are **named actions with parameters**, implemented in TypeScript and
referenced by name. They are not raw shell, and they are not logic expressed in
YAML.

## Why, and why not the other two

**Bash backbone with shell drop-ins.** Needs no runtime and no build step, and
it is honest about a domain that is mostly shelling out to `pnpm`, `dsh` and
`git`. It loses on the thing this migration exists to fix: state lives in
comments. `sync.sh` knows why the compaction fork installs under the basic
package name, and that knowledge is a comment, so nothing can read it. No shell
script can be introspected by `thursday status`, by a coverage test, or by a
registry entry later. Rejected.

**TypeScript backbone with YAML drop-ins.** Blocks become data, so ordering,
introspection, generated docs and a future registry all fall out for free. The
failure mode is well documented and severe: YAML grows conditionals, then loops,
then templating, until it is a bad programming language with no debugger. Installs
invite exactly that, through platform branches and already-installed checks.
Rejected as the whole answer, kept as the frontmatter.

**Literate markdown.** Solves the comment problem by construction: the rationale
is the file rather than an annotation beside it. One block is one reviewable
unit, one dispatchable task, and one publishable registry entry. Chosen.

Note this is not a choice between shell and TypeScript overall. `install.sh`
must be POSIX sh whatever happens, because Node does not exist yet when it runs.
The layering is: shell bootstrapper, TypeScript engine, markdown blocks.

## The shape

    ---
    id: llm-pi-ai
    version: 1
    rationale: >
      A vendored fork of the pi-ai adapter. The builtin row must be disabled or
      two registrars claim one provider name and the adapter registers twice.
    dependsOn: [dsh-runtime]
    installs:
      - path: profiles/web/node_modules/@deepseek-ai/dsh-llm-pi-ai
        from: packages/plugins/llm-pi-ai
    modifies:
      - file: profiles/web/cordis.patch.yml
        constraint: top-level-override
        why: >
          applyEntryPatches assigns each override key wholesale rather than
          deep-merging, so a partial override silently drops every default it
          does not restate. An insert row with this id would also collide with
          the builtin and kill boot on a duplicate loader entry id.
    steps:
      - action: pnpm-add
        spec: ./packages/plugins/llm-pi-ai
      - action: patch-row
        id: llm-pi-ai-affinity
        name: '@deepseek-ai/dsh-llm-pi-ai'
      - action: disable-row
        id: llm-pi-ai
    detect:
      - action: row-present
        id: llm-pi-ai-affinity
    ---

    # llm-pi-ai

    Prose body. What this fork changes against upstream, what breaks without it,
    and what to check when it goes wrong. This is the part that survives a
    migration, and it is why the format is markdown rather than YAML.

## Rules

**Steps are named actions.** `pnpm-add`, `patch-row`, `disable-row`,
`copy-tree`, `write-settings-key`. Each is TypeScript, takes typed parameters,
and is idempotent. A block that needs behaviour no action provides gets a new
action, not an escape hatch.

**No logic in frontmatter.** No `if`, no loops, no templating, no expression
language. Anything conditional is an action that decides in TypeScript, where it
can be tested. This is the single rule that keeps the format from becoming the
YAML option we rejected.

**Raw shell is permitted only through the `run` action, and it is rare.**
Acceptable: invoking a third-party installer that has no API, such as a vendor's
own setup script. Not acceptable: anything an action could express, anything
with a conditional, anything whose failure needs interpreting, or anything
touching a path a block already declares. A `run` step must carry a `why`, and
review should treat one as a request for a new action.

**Constraints are data, and the set is closed.** `top-level-override`,
`wholesale-override-config`, `no-yaml-round-trip`, `needs-allow-builds`,
`alias-install-name`, `nested-tool-config`. This is where `sync.sh`'s hardest-won knowledge lands —
the `off:` key that YAML 1.1 turns into a boolean and drops every pi-ai
provider with it, the codeload URL `allowBuilds` needs — instead of being
deleted in translation.

Saying "the installer honours them" is not enough, and I1's implementation was
right to push back on it. A constraint name with nothing behind it is a string,
and the knowledge dies exactly the way it died in the shell comments. So each
constraint is a REGISTRY ENTRY carrying three things: its failure mode in plain
words, the named actions that honour it, and where in `sync.sh` it came from.
Two of them are deliberately split so each name carries one hazard.
`top-level-override` is about placement only: the row must be a top-level
override, never a child of the insert list, because a duplicate loader entry id
kills boot. `wholesale-override-config` is about completeness: override
assignment is wholesale (`target[key] = value`), so an override carrying a
`config:` must restate every default it wants to keep. The loader enforces the
second at load: an override `patch-row` step that carries a `config:` and does
not declare `wholesale-override-config` is a load error, and an override
without a `config:` (a bare `disabled: true`) needs no such declaration.
Two rules fall out and both are enforced at load. A constraint name outside the
registry is a validation error, because an open-ended name gives the installer
nothing to act on. And a constraint declared on an action that does not honour
it is also an error, which is what stops a constraint decaying into decoration
that looks like a guarantee.

A `why` is mandatory wherever a constraint appears. Optional prose is prose
nobody writes.

**One copy of each step.** The code for a step exists only as its action
implementation, and the block references it. Prose describes; it never restates.
Prose and behaviour cannot diverge if there is nothing to diverge from.

**`rationale` is machine-readable.** `thursday status` prints it, so "why is
this installed" is answered by a command rather than by reading a shell script.

## What this costs

Two parsers, frontmatter and markdown, though both are libraries. An editor will
not lint the frontmatter against the action signatures without tooling we have
not written. And the prose can still go stale relative to the actions — the
one-copy rule prevents code drift, not documentation drift. Review is the only
control for that, and it is a real cost, not a solved problem.

## Adopting it

I12 pilots this on `llm-pi-ai` before the other blocks are authored, because it
is small and still exercises the wholesale-override behaviour that is the
fiddliest thing in the composition. If the format cannot express that block
cleanly, this document is wrong and gets revised before thirty blocks are
written against it.
