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

`interactions/` is flat. File names are short and verb-first:

- `doit-vs-only.md` · the pair, and the scope mistake
- `no-verb.md` · a vague request, and the agent stopping
- `think-mid-prompt.md` · `/ththink` inline in a longer sentence
- `log-inline-destination.md` · `/thlog` with the destination in natural language
- `learn-first-tour.md` · `/thlearn 5` on a fresh install
- `back-after-a-week.md` · `/thback` on a project the user forgot
- `lost-mid-drift.md` · `/thlost` when the session has wandered
- `feedback-objection.md` · `/thfeedback` on something the user disagrees with
- `revisit-due.md` · `/threvisit` with three buckets
- `reading-a-diff.md` · reviewing what the agent wrote
- `setup-end-to-end.md` · a full first install

Add files as they are written. Do not write them from imagination — wait until
the interaction actually happens.

## Undo

Delete this directory. Nothing else reads it.
