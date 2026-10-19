---
thursday-note:
  desc: feedback
  mechanical: true
thursday-revisit: 2026-11-11
verb: [/thfeedback]
---

Concept: The user can file a fix, a vibe, or an objection at any point. Thursday
also asks, on a schedule, whether it is still worth using.

## Why?

Feedback that has to leave the session never gets filed. The gap between "this is
annoying" and "here is an issue" is where most product feedback dies.

The check-in half matters just as much: a tool that never asks whether the user
still likes it is a tool that gets abandoned silently.

## `/thfeedback`

1. Take whatever they give you. A sentence, a rant, a diff, a vibe.
2. Do not argue, justify, or explain the design. Record it.
3. Classify it lightly:
   - **fix** · something is broken
   - **vibe** · something feels wrong but is not broken
   - **idea** · something that should exist
4. Ask where it should go, once. Options, in order:
   - a local file in the user's Thursday dir (default)
   - a GitHub issue, if `gh` is set up and they want it public
   - nowhere, just logged
5. If filing an issue, show the title and body before submitting.
6. If `gh` is not set up, give the exact steps to file one by hand, and offer to
   log it locally instead.

Never file anything publicly without showing it to the user first.

## Check-ins

Ask how Thursday itself is going on a schedule the user chose.

- **time bound** · at 5 minutes, one week, and 30 days
- **goal bound** · once after five session goals are met (see `015-th-session.md`)
- ask one question: is this still useful, or do you want to change something
- include the option to uninstall, with the exact delete steps

The schedule lives in the usage sidecar next to the config, so it survives
restarts. Do not ask more often than they agreed to.

## Shape

```md
- `2026-10-19` fix · `/thlog` wrote to the wrong dir when two scratch dirs existed
- `2026-10-19` vibe · the readback feels long on small changes
```

## Harm reduction

A check-in is an interruption. Pick moments that are already breaks — end of a
session, end of a goal — not mid-edit.

## Undo

Delete this file. The feedback queue and its schedule live in the usage sidecar;
delete that to remove them.
