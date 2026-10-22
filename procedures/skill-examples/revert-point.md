---
thursday-note:
  desc: a destructive change, and the revert named before it
  undo: delete this file
thursday-revisit: 2026-11-11
---

# A revert point, offered before the change

exercises: `000-th-how-to-talk` · no verb

## Prompt

```
delete the old procedures dir, we don't need it anymore
```

## Response

```
READBACK
- delete `procedures/old/`, nothing else. Did I get it?
- waiting.

PICTURE
- `procedures/old/` · 12 files · last touched in commit `c7c57d9`
- nothing in it is imported by the current skill

NEXT
- go/no-go · delete the directory
- option · keep it and move it to `experiments/` instead

DATA
- revert · `git checkout c7c57d9 -- procedures/old`
- the files are committed, so nothing is lost either way

FEEDBACK
- none
```

## Decision

- delete

## What it shows

- destructive work names its undo before it happens, not after
- "it is in git" is a revert point, and saying so makes the go/no-go honest
