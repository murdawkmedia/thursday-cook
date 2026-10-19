---
thursday-note:
  desc: procedures
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: A procedure is one concept in one file. The user can write their own, and
can override any of Thursday's.

## Why?

Thursday cannot pre-encode every procedure a user will need. The system has to
assume other parts of it are working, and be composable enough that the user
extends it themselves.

Procedures are also how human intelligence is encoded so a lower intelligence can
use it. Run it by hand, understand it, write it down, then decide how much of it
to automate.

## Naming

- shipped · `<number>-th-<slug>.md` in the repo's `procedures/`
- user · `user-yyy-<slug>.md` in the user's `procedures/`
- override · `user-yyy-<number>-th-<slug>.md`, same number and slug

Numbers are three digits, ranked by importance. `000` is the most important. When
two procedures are equally important, the lower number is read first.

Directory organization is the user's choice. Flat is the default; nested is fine
if they prefer it.

## The template

```md
---
thursday-note:
  desc: <one line>
  undo: <what to delete, or the command that reverts it>
  mechanical: true      # only if the agent must follow it literally
verb: [/th-name]        # omit the line entirely if there is no gesture
thursday-revisit: <date>
---

Concept: <one or two lines>

## Why?

<why this exists, five lines at most>

## General procedure

1. <ordered steps>

## Harm reduction

<how this could hurt the user, and what to do instead>
```

Size follows content. There is no line cap. Do not force every procedure through
a lens structure; use the shape that fits the concept.

## Overrides and escape hatches

- a shipped procedure is the default
- if a `user-yyy-` file shares the number and slug, it wins
- the shipped file names its own override path, so the agent knows to look
- when a user procedure looks nearly identical to a shipped one, say so once and
  offer to diff. Do not reconcile silently.

## Writing a procedure

1. Do it by hand first. A procedure written from imagination is fiction.
2. Find the smallest version that still works.
3. Write it in the template shape.
4. Put it in the user's `procedures/`, as `user-yyy-<slug>.md`.
5. Add a revisit date. If it is still earning its keep in a month, keep it;
   otherwise delete it.
6. If it needs a gesture, give it a verb and regenerate the pointers.

## When a procedure becomes a script

Some procedures are mechanical enough to be worth running instead of reading.
The same rule applies to them as to every Thursday tool: **feature parity between
the human interface and the machine interface.**

- the human path offers a prompt, a menu, or a readable listing
- the machine path offers flags for the same actions, with data on stdout
- one implementation serves both; never ship a human-only wrapper around a
  machine-only core
- `scripts/sessions-viewer.ts` is the model: a picker for a person, `--latest
  --message 7` for a script, and the picker on stderr so the transcript still
  pipes

If you cannot automate it, it is not finished.

## Backlinks

Links are written by hand. The agent names its neighbours; the index names the
doors.

What a script is good for is a **check**: every shipped procedure must be
reachable from the root index, and no procedure may point at a file that does not
exist. Orphans are a bug.

## Harm reduction

Every procedure the user adds is future maintenance. Ask whether it earns its keep
before encouraging them to write one.

## Undo

Delete this file. Procedures the user already wrote are theirs and stay.
