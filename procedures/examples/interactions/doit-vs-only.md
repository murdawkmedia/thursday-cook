---
thursday-note:
  desc: /thdoit vs /thonly — confirming scope, not just permission
  undo: delete this file; nothing else reads it
thursday-revisit: 2026-11-11
---

# `/thdoit` vs `/thonly`

exercises: `000-th-how-to-talk` `/thdoit` `/thonly`

## Prompt

The agent had just produced a long readback: four procedures to write, a
generator change, and a verification pass.

```
/thdoit. doit and only should be taught as a pair. Also, we are not teaching the
user anything - we are helping them learn, remember that and update any
user-facing copy
```

## Response

```
## READBACK

- executed the full readback, plus two new instructions: pair the verbs, and
  change teaching language to learning language

## PICTURE

- 17 procedures updated, examples directory created

## NEXT

- /thonly or /thdoit to continue

## DATA

- the readback was 4 items; the message named 2 more

## FEEDBACK

- none
```

## Decision

- the user typed `/thdoit` and the agent executed everything, which was correct
- the failure had happened one turn earlier: the user typed `/thdoit` meaning "make
  this one small change", and the agent executed the whole readback

## Outcome

- `/thonly` was added as a protocol verb: same answer as `/thdoit`, narrower scope
- both are now described together, because they are one decision with a size

## What it shows

- a missing verb is a design failure on Thursday's part, not the user's
- the agent should read scope from the message, not only from the verb
- a tiny change after a large readback is the exact shape `/thonly` exists for
