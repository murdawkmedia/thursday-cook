---
thursday-note: setup migration 0002
thursday-revisit: 2026-11-11
---

# 0002 · personal dir first

Idempotent, and platform-agnostic. Running it twice is not an error.

## Requires

- checkout at least `<commit>` — the short hash that carries the personal-first
  rule in the root skill and in `scripts/gen-th-skills.ts`

Before it, every verb skill names `<install.repo>/procedures/` and nothing else,
so an installed agent reads the clone and never looks in the user's own dir.
After it, the personal dir is read first and the checkout is the fallback. Without
the move, regenerating the skills would install a rule the checkout does not
have, and the skills would point at a resolution order nothing else follows.

## Resolve

Same paths as `035-th-setup.md`. Read them from the config; never hardcode.

- `[paths].root` · the install root
- `[install].repo` · the checkout, `<root>/checkout` by default
- `[install].skills` · one entry per harness whose skills need regenerating
- `[install].bun_path` · the bun that ran setup; use it, do not re-detect
- `[personal].procedures` · the user's procedures; created if missing

Honor `XDG_DATA_HOME` when resolving the root if it is set.

## Steps

**1. Move the checkout first.**

Everything after this assumes the new rules exist. Update before changing
anything, never after.

```sh
git -C <root>/checkout fetch --quiet origin
git -C <root>/checkout merge --ff-only <commit>
```

- if the checkout has local changes, stop and say so. Never stash, never discard
- if the merge is not fast-forward, stop. The user is ahead of the release; ask,
  do not reset
- if `<commit>` is not an ancestor of `HEAD` afterwards, stop. Do not continue
  with half the rules

**2. Create the personal procedures dir if it is missing.**

Create `<personal>/procedures/`. If it exists, leave it alone.

Do not copy the shipped procedures into it, and never overwrite a `user-yyy-*`
file. The checkout stays the only copy of a shipped procedure; the personal dir
holds what the user wrote, and any file there now wins.

**3. Regenerate the installed skills.**

For each dir in `[install].skills`:

```sh
<install.bun_path> run <install.repo>/scripts/gen-th-skills.ts --out <skills dir>
```

The generator rewrites one skill per verb, copies the root skill, and prunes only
files carrying its own marker. Skills other people wrote in that dir are left
alone. A verb skill now tells the agent to read `<personal>/procedures/<file>`
first and the checkout copy only as a fallback.

**4. Update the config.**

Set `install.version = "0.1.1"`.

## Verify

- each verb skill names the personal dir first. In every dir from
  `[install].skills`:
  `rg -l "personal dir comes first" <skills dir>`
  lists the verb skills, and the root skill contains `## Where Thursday reads
  from`
- no skill still says only `<install.repo>/procedures/` with no personal copy
  mentioned. If one does, generation ran from an old checkout or wrote to the
  wrong dir; rerun step 3
- every procedure a skill names resolves. Check `<personal>/procedures/<file>`
  first, then `<install.repo>/procedures/<file>`. If neither exists, report the
  dangling skill instead of leaving it
- `install.version` in `<root>/thursday.toml` reads `0.1.1`

If a user sees a skill still pointing at the checkout, step 3 did not run against
the new checkout or used a stale bun path.

## Undo

- the checkout stays at the new commit. Say so plainly; this is not a rollback of
  Thursday itself
- to restore the previous skill text, regenerate from a throwaway worktree at the
  prior commit:

  ```sh
  git -C <root>/checkout worktree add <temp>/th-prev <previous commit>
  ```

  then run the same generator from `<temp>/th-prev` into each `[install].skills`
  dir, and remove the worktree with
  `git -C <root>/checkout worktree remove <temp>/th-prev`
- set `install.version` back to `0.1.0` by hand
- `<personal>/procedures/` stays. Remove it only if it is empty; anything in it
  is the user's

## Harm reduction

Migrations run on a machine with someone's work on it.

- the only writes are skill files and one directory. Nothing in the personal dir
  is read into, moved, or overwritten
- the generator prunes by its own marker, so it cannot delete another tool's
  skill
- if the checkout will not move cleanly, stop and say so. Updating by force is
  how someone's local work disappears
