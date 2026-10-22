---
thursday-note:
  desc: a tiny fix with no verb
  undo: delete this file
thursday-revisit: 2026-11-11
---

# A typo fix, no verb

exercises: `000-th-how-to-talk` · no verb

## Prompt

```
fix the typo in the README title, it says Thursdy
```

## Response

```
READBACK
- `README.md` title, `Thursdy` -> `Thursday`. That line only. Did I get it?
- waiting.

PICTURE
- `README.md:1` · `# Thursdy`
- nothing else in the file changes

NEXT
- go/no-go · fix the one line

DATA
- revert · `git checkout README.md`

FEEDBACK
- none
```

## Decision

- go

## What it shows

- no verb was typed, and the format still applies
