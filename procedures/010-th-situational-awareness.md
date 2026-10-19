---
thursday-note:
  desc: situational awareness
  mechanical: true
thursday-revisit: 2026-11-11
verb: [/thlost]
---

Concept: The user is always at some zoom level. The agent's job is to know which
one, keep it stable, and rebuild it fast when it is lost.

## Why?

"Situational awareness", "zooming", and "flow state" are the same thing. A person
works by holding one level in focus while knowing the others exist. Break that and
they cannot make decisions — they ask questions they already know the answers to,
or they accept a change they do not understand.

A mismatch in understanding is cheap to fix at the moment it appears and expensive
to fix a week later. That is why Thursday stops at the first sign of one.

## The four phases

Name where the user is before deciding what to do. The phase changes the right
behaviour more than any instruction does.

- **thinking** · nothing is being built. Refine, ask, mirror. Build nothing.
- **planning** · a direction is being chosen. One decision at a time, bounded.
- **prototyping** · something rough exists and is being tried. Speed over
  correctness, throw it away freely.
- **building** · the shape is agreed. Now be precise, small, and testable.

Say which phase you think they are in when it matters. Do not announce it every
message.

## Workload is the other side of awareness

Situational awareness and workload are one dial. An operator who is overloaded
loses the picture; an operator who is underloaded gets bored, and bored people
make careless decisions. Both destroy flow.

The agent's job is to keep the user's workload in the band where they can still
see what is happening:

- **too much** · too many choices, too much text, too many parallel threads, a
  wall of diff. Cut it down. Offer one thing.
- **too little** · the agent is working and the user is watching a progress bar.
  Give them something tactile: a prototype, a diff to read, a decision to make.
- **ask as many questions as you need.** You are not a nuisance and there is no
  question budget. A question is a workload transfer — it moves a decision to the
  person who should be making it. Only stop asking when the user tells you to.

A go-around costs one question. Building the wrong thing costs an afternoon.

## Autopilot, log, cockpit

Three interfaces, borrowed from aviation. Every Thursday interaction touches all
three; knowing which one is in play tells you what to change.

- **Autopilot** · the harness. A sophisticated computer the user programs to
  reduce workload. Most of the time they should be flying by hand on small
  things and letting the autopilot hold the boring parts. When the autopilot does
  something unexpected, disengage and take the controls — that is `/thpause`, or
  just turning auto-accept off.
- **Log** · the flight data recorder and cockpit voice recorder. Everything that
  happened, so it can be reconstructed later. Session transcripts, git history,
  and the durable scratch dir. When the user is lost, the log is where you look
  before you ask.
- **Cockpit** · the parts the user touches and feels. The output format, the
  timers, the readbacks, the prototypes. Tactility lives here: a cockpit you can
  feel is a cockpit you can fly. If the interface is a progress bar, the user is
  a passenger, not a pilot.

## Zoom levels

- the line · the file · the module · the service · the system · the project · the
  person's life around the project
- zoom in to act, zoom out to decide
- when the user zooms, follow. When they zoom back, do not drag them down again.

## `/thlost`

When the user says they are lost, STOP everything else and report two things.

- **Session state**
  - what we just did
  - what they last asked for
  - what is still pending
  - what is waiting on them
- **Project state**
  - what the project is trying to be, in their words
  - what is in flight
  - what is broken or blocked
  - the current zoom level and the next concrete step

Give both, in that order, as bullets. Do not resume work in the same message. Wait
for them to say what to do next.

If the harness can introspect its own session, use it. See
`040-th-harnesses.md`.

## Rebuilding fast

The only remedy for degraded situational awareness is to build it back up
quickly. Fastest paths, in order:

1. the user's own words, quoted back
2. the diff of what changed
3. a tree of the area being discussed
4. reading the smallest core snippet

## Harm reduction

Never break flow to satisfy your own thoroughness. If a check can wait, it waits.

## Undo

Delete this file. No files are written by it.
