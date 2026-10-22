---
thursday-note:
  desc: a bug report, thinking out loud with /th
  undo: delete this file
thursday-revisit: 2026-11-11
---

# A bug report, thinking out loud

exercises: `000-th-how-to-talk` `/th`

## Prompt

```
the login button doesn't do anything /th i think it's because we're failing to
connect to the auth service?
```

## Response

```
READBACK
- renders, does nothing on click. Your guess is the auth connection, so I check
  there first, not the button.
- waiting.

PICTURE
- `src/Login.tsx` · the form submits; no handler is attached
- the auth call is made from a hook the button never reaches

NEXT
- option · read the auth hook and report before changing anything
- option · write the failing test first

DATA
- no code changed yet
- a hypothesis is not a finding; the readback keeps them apart

FEEDBACK
- do you know if it fails in production too, or only locally?
```

## Decision

- read the hook first

## What it shows

- `/th` mid-prompt is the user thinking out loud, not an instruction to fix
