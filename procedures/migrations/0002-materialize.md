---
thursday-note: setup migration 0002
thursday-revisit: 2026-11-11
---

# 0002 · procedures materialized

Idempotent, and platform-agnostic. Running it twice is not an error.

## Requires

- `install.version` at `0.1.1`. At `0.1.2` this has already run
- checkout at least `<commit>` — the short hash that carries materialization and
  `scripts/th-proc.ts`

Before it, an agent resolved a procedure by reading the personal copy and falling
back to the checkout. With an empty `procedures/` that is a failed read every
session, and the transcript shows both sources. After it, the personal dir holds
the whole set and the resolver prints exactly one path.

## Resolve

Same paths as `0001-setup.md`. Read them from the config; never hardcode.

- `[paths].root` · the install root
- `[install].repo` · the checkout
- `[install].skills` · one entry per harness
- `[install].bun_path` · the bun that ran setup; use it, do not re-detect
- `[personal].procedures` · where the copies go

## Steps

**1. Move the checkout first.**

Everything after this assumes the new rules exist.

```sh
git -C <root>/checkout fetch --quiet origin
git -C <root>/checkout merge --ff-only <commit>
```

- if the checkout has local changes, stop and say so. Never stash, never discard
- if the merge is not fast-forward, stop. The user is ahead of the release; ask,
  do not reset

**2. Materialize the procedures.**

Copy `<root>/checkout/procedures/` into `<personal>/procedures/`, skipping
`migrations/`. Never overwrite: a file already there is the user's copy now.

The copy is what `scripts/setup.ts` does, so re-running setup does this and the
next step together, without re-cloning:

```sh
<install.bun_path> run <root>/checkout/scripts/setup.ts \
  --personal <personal> --skills-dir <each skills dir> --yes
```

**3. Regenerate the skills.**

`setup.ts` does this too. Run alone it is:

```sh
<install.bun_path> run <root>/checkout/scripts/gen-th-skills.ts \
  --out <skills dir> --repo <root>/checkout --bun <install.bun_path>
```

Each verb skill now names the resolver instead of the personal-first fallback.

**4. Update the config.**

Set `install.version = "0.1.2"`.

## Verify

- `bun run <root>/checkout/scripts/th-proc.ts --list` lists every procedure with
  `personal` as its source. A name that still says `checkout` did not copy
- `bun run <root>/checkout/scripts/th-proc.ts --json 000-th-how-to-talk.md` returns
  a `path` under `<personal>/procedures`
- no generated skill still says the personal dir comes first or names
  `<install.repo>/procedures/` as a second read. `rg -l "th-proc.ts" <skills dir>`
  lists the verb skills
- `install.version` in the config reads `0.1.2`

## Undo

- the copies in `<personal>/procedures/` are files setup created. Remove the ones
  the user has not edited; keep anything modified, and say which those are
- restore the previous skill text by regenerating from a worktree at the previous
  commit:

  ```sh
  git -C <root>/checkout worktree add <temp>/th-prev <previous commit>
  ```

  then run the generator from `<temp>/th-prev` into each skills dir, and remove
  the worktree

- set `install.version` back to `0.1.1` by hand
- the checkout stays at the new commit. This is not a rollback of Thursday

## Harm reduction

- the only writes are copies into the personal dir and skill files. Nothing in the
  personal dir is overwritten
- if the checkout will not move cleanly, stop and say so. Updating by force is how
  someone's local work disappears
- the copies make the checkout irrelevant to an agent. A shipped procedure update
  will not reach a copy the user has edited, so say that out loud once
