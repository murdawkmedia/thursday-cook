---
thursday-note:
  desc: procedure template
thursday-revisit: 2026-11-11
---

# Procedure template

Copy this into `procedures/<number>-th-<slug>.md`, or into the user's
`procedures/user-yyy-<slug>.md`.

```md
---
thursday-note:
  desc: one line
  undo: what to delete, or the command that reverts it
  mechanical: true      # only if the agent must follow it literally
verb: [/th-name]        # omit the line entirely if there is no gesture
thursday-revisit: YYYY-MM-DD
---

Concept: one or two lines. What this is.

## Why?

Why this exists. Five lines at most. If it cannot be justified, it probably
should not be a procedure.

## General procedure

1. Ordered steps, imperative.
2. Keep it to what a person could actually follow.
3. Point at other procedures rather than inlining them.

## Harm reduction

How this could hurt the user, and what to do instead.
```

## Rules

- one concept per file
- size follows content; there is no line cap
- not every procedure needs every section
- not every procedure needs a verb
- procedures may reference each other; they never duplicate each other
- a procedure without a `## Why?` is usually a rule pretending to be a procedure
- if writing it took five minutes and it will save five minutes once, do not
  write it
