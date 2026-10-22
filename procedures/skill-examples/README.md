---
thursday-note:
  desc: how to write an example interaction
  undo: delete this file; nothing else reads it
thursday-revisit: 2026-11-11
---

# Example interactions

One interaction per file, in `interactions/`. Each one shows the response format
in use, under 50 lines.

Examples are not documentation. They are the thing `/thlearn` hands over instead
of an explanation. A person who reads one should be able to copy the shape.

## Shape

```md
---
thursday-note:
  desc: <one line: what this example demonstrates>
  undo: delete this file
thursday-revisit: <date>
---

# <title>

exercises: `<procedure>` `<verb>`

## Prompt

\`\`\`
the user's words, verbatim, including the typo
\`\`\`

## Context

- only when the prompt does not stand alone: what came before, what the agent
  already knew, why the user asked this way
- one or two bullets. If the prompt makes sense without it, leave it out

## Response

\`\`\`
the full READBACK · PICTURE · NEXT · DATA · FEEDBACK block
\`\`\`

## Decision

- what the user picked, and why it mattered

## Outcome

- what actually happened, in one or two lines

## What it shows

- one line per point. The failure is often more useful than the success.
```

## Rules

- **verbatim prompts.** Keep the typos, the brevity, the mid-sentence changes.
  A cleaned-up prompt describes a machine that does not exist.
- **one decision per file.** If an example needs two decisions, it is two files.
- **under 50 lines.** The response block is usually most of it.
- **name the procedure it exercises.** `exercises:` is a machine-readable line so
  `/thlearn` can find the right example for the moment.
- **show the failure when the failure is the lesson.** The `/thonly` example
  exists because `/thdoit` was used on a tiny change.
- **no invented detail.** If the example did not happen, mark it
  `illustrative: true` in the frontmatter so nobody treats it as evidence.

## Index

`interactions/` is flat. Each file is one prompt and the response it gets.

No verb, and the format still applies:

- `no-verb-typo.md` · a one-line fix
- `no-verb-vague.md` · three readings offered instead of one chosen
- `revert-point.md` · a destructive change, undo named first
- `break-offered.md` · frustration noticed, and a stop offered

One verb:

- `one-verb-talk.md` · `/th` mid-sentence, a question not a task
- `bug-with-think.md` · `/th` mid-prompt, with a hypothesis attached
- `one-verb-only.md` · a tiny change, scoped

More than one verb:

- `many-verbs-log-doit.md` · capture and act in the same prompt
- `many-verbs-learn-only.md` · `/thlearn` sets the topic, `/thonly` the size
- `doit-vs-only.md` · the scope mistake that created `/thonly`

Not yet written, and deliberately so — wait until each actually happens:

- `/thback` on a project the user forgot
- `/thlost` when the session has drifted
- `/thfeedback` about Thursday itself
- `/threvisit` with three buckets
- reviewing a diff the agent wrote
- a full setup, end to end

## Undo

Delete this directory. Nothing else reads it.
