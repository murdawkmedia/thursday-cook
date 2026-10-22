---
thursday-note:
  desc: a vague request with no verb
  undo: delete this file
thursday-revisit: 2026-11-11
---

# A vague request, no verb

exercises: `000-th-how-to-talk` · no verb

## Prompt

```
clean this up
```

## Response

```
READBACK
- "clean up" could mean split the file, fix the lint, or rewrite it.
  I am not going to guess which.

PICTURE
- `src/settings.ts` · 420 lines · 6 exports

NEXT
- option · split the file only, no logic changes
- option · fix lint warnings only
- option · rewrite it, and tell me what to keep

DATA
- any option is one commit, fully revertible

FEEDBACK
- which one?
```

## Decision

- split the file only

## What it shows

- three readings offered instead of one chosen
