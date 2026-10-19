---
thursday-note:
  desc: pause and resume
  mechanical: true
thursday-revisit: 2026-11-11
verb: [/thpause, /thback]
---

Concept: Leave a project and come back without re-deriving everything. One
procedure, two gestures: `/thpause` writes the resume point, `/thback` reads it.

## Why?

The equivalent of writing "BROKEN" in your source file and going to lunch — except
the note is for the person coming back, who may be you next week.

Context decays. The whole cost of an interruption is rebuilding the picture, and
most of it can be paid in advance with a few bullets.

`/thback` is the important one. It should work after an hour, or after three
months, when the user has forgotten what this project even was.

## `/thpause`

Write the resume point, then stop.

- what we were doing, in one line
- what is done and working
- what is in flight, half-finished, or broken
- the next concrete action
- anything the user must not forget: a decision, a gotcha, a command
- where the durable state lives

Make it durable. Current state must survive a restart, a wiped `/tmp`, and a
closed terminal.

Where it goes:

- a `scratch/` dir at the relevant level, or
- a `thursday-note` in the file being worked on, with a `revisit` date, or
- the user's Thursday dir when it spans projects

## `/thback`

Read the resume point, then report. Do not start work.

- **where we were** · the project, the goal, the last action
- **what changed since** · anything visible in git, files, or the session
- **what is next** · the recorded next action, and whether it still makes sense

If there is no resume point, rebuild from the project state and say that you are
doing so. See `010-th-situational-awareness.md`.

If the resume point is stale — the described state no longer matches the repo —
say so before doing anything.

## Harm reduction

Never resume by doing. Resume by reporting, then wait.

## Undo

Delete this file. Resume points already written stay where they were written; delete
them by hand if the user wants them gone.
