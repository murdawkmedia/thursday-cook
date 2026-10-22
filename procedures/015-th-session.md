---
thursday-note:
  desc: session
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: A session is a human-decided time block for the current work. It has a
beginning (pre-brief), a clock (timer), and an end (post-brief).

## Why?

Unbounded work is where fatigue, scope creep, and the "we'll clean it up later"
debt all come from. A bounded block makes stopping normal, which makes review
normal.

The pre-brief is also how the agent knows what the session is for. Without it the
agent cannot tell a tangent from progress.

## Pre-brief

Ask for two things, and keep it short. Both can be one line.

- **goal** — what does done look like for this block?
- **data** — what do we already know that matters? constraints, links, previous
  attempts, the thing that failed last time

Example:

```md
**goal** · settings panel rewritten without changing behaviour
**data** · 178 lines · consumed by App and SettingsModal · must keep dirty
tracking and blur validation
```

If the user does not want a pre-brief, take a one-line goal anyway and move on.

## Session state

Write the block down when it starts. Do not keep it in your head — the point is
that it survives compaction, a restart, and a new session.

`<root>/state/session.json`:

```json
{
  "started_at": "2026-10-21T14:02:00Z",
  "goal": "settings panel rewritten without changing behaviour",
  "data": "178 lines, consumed by App and SettingsModal",
  "block_minutes": 50
}
```

- written once, at the pre-brief, after the goal is known. Ask for the goal if
  they have not given one; one line is enough
- read on load and on `/thback`. Report elapsed whenever it changes what you would
  suggest — before offering a break, in the post-brief, when the block is over
- a new block replaces the file and appends the old one to `session.log`
- if the file is absent, there is no session. Say so and ask for a goal; do not
  invent a start time

Elapsed time is a fact about the session, not about the work. It is how you know
when to offer a stop, and it is the only way the user finds out they have been at
one thing for three hours.

## Timer

Offer a bounded block. Ask; do not impose.

- typical blocks · 25, 50, 90 minutes
- at the start, agree what happens at the end: stop, or re-up
- a timer is a prompt to stop and check, not an alarm to obey
- if the user says they will figure it out themselves, drop it

If the harness can schedule (`cron`, timers, background tasks), offer it. A script
is fine. A sticky note is fine too.

## Goals

A session can carry a small list of concrete goals. Cap it at five.

- a goal is concrete and bounded: "panel split into three components", not
  "clean up settings"
- when a goal is met, say so plainly and move on
- after five goals, check in before adding more. That check-in is also where
  `045-th-feedback.md` asks how Thursday itself is going.

## Post-brief

Two bullets. No ceremony.

- **outcome** — what actually happened, including what did not
- **learnings** — what we know now that we did not before

Then stop. If the user wants to continue, that is a new block with a new pre-brief.

## Harm reduction

The first check in any session is operator state, then the goal, then the stop
time. If the user is tired or frustrated, the correct session is a short one or
none at all.

## Undo

Delete this file. A brief that was already written stays in the user's threads.
