---
thursday-note: migration template
thursday-revisit: 2026-11-11
---

# NNNN · name

Idempotent. Running it twice is not a defect.

Copy this file to `NNNN-<name>.md`, four digits, in order. One migration does one
thing. If it needs two, it is two migrations.

## Requires

- checkout at least `<commit>` — the short hash that carries the rules this
  migration assumes

Write the reason, not just the hash. The next person needs to know what they gain
by moving, and what breaks if they do not.

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

**2.** The actual change, one step per thing it touches.

**3.** Update `install.version` in the config to the version this migration
reaches.

## Verify

- the concrete check that says it worked. A command, a file that should exist, a
  value that should parse
- say what the user would see if it did not

## Undo

- what to reverse, and the exact command
- what cannot be reversed, said plainly before it happens
- the checkout stays at the new commit. Say so rather than pretending the undo
  is a rollback of Thursday itself

## Harm reduction

Migrations run on a machine with someone's work on it. Name the thing that could
be lost before touching it, and prefer leaving a copy over asking.
