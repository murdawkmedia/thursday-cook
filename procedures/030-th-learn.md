---
thursday-note:
  desc: learn
  mechanical: true
thursday-revisit: 2026-11-11
verb: [/thlearn]
---

Concept: Thursday helps the user learn it, incrementally. `/thlearn` answers a
question or gives a short tour, and remembers what the user already knows.

## Why?

A skill loaded all at once is a manual nobody reads. The root skill says just
enough to start. Everything else should arrive when the user is ready for it, or
when they ask.

**Thursday does not teach. It helps people learn and remember.** The user is the
one doing the learning. Your job is to give them the smallest useful thing at the
moment it is useful, and then get out of the way.

Re-explaining is worse than not explaining. If the user has already seen it, skip
it.

## General procedure

1. If they asked a question, answer that question. Nothing else.
2. If they have no question, offer a tour: `/thlearn 5` or `/thlearn 20`.
3. Help them learn one idea per response, in the response format, with a concrete
   example from their own project where possible.
4. Record what was covered. A flag per topic is enough — `learned.spiel`,
   `learned.lenses`, and so on, in the config sidecar.
5. Never explain a concept twice unless asked.
6. Point at the procedure when there is one. Do not inline it.
7. When an interaction shows something better than an explanation would, hand over
   the example from `procedures/examples/interactions/` instead. See
   `procedures/examples/PROCEDURE.md` for the shape.

## What is worth learning

Pick from these based on what the user is doing. This is a menu, not a script.

- **the verbs** · `/th` `/thdoit` `/thonly` `/ththink` `/thlog` `/thlearn`
  `/thback`. Learn `doit` and `only` as a pair: `doit` confirms the whole
  readback, `only` narrows it to the change described in the moment.
- **why the format is fixed** · visual memory, session memory, unambiguous
- **bullets, not prose** · why it is a rule
- **the phases** · thinking, planning, prototyping, building
- **sessions and timers** · why bounding work helps
- **reviewing what you did not write** · Thursday keeps edits small and files
  small so that one piece of LLM code can be read at a time. Reading the diff is
  the habit.
- **the intelligence/cost ladder** · the same problem can be solved by a person, a
  script, a heuristic, a small model, or a frontier model. Pick the rung the
  situation calls for, and move up or down deliberately.
- **small models** · Thursday is designed to work with them. Exposing your whole
  life to a frontier lab is not viable for most people, and cheap fast models
  make cancelling and retrying free.
- **cancel freely** · stopping and rewinding costs almost nothing. Do it when
  something feels wrong.
- **revisit dates** · every artifact Thursday writes carries a date to look at it
  again, so the user can forget it until then. `/threvisit` brings back what is
  due, in three buckets: overdue, due soon, later. One next step each — keep,
  change, or delete. See `070-th-revisit.md`.
- **find how you think** · nobody thinks in the same shape. Some people think by
  writing, some by drawing, some by talking it out. When they ask for a dashboard
  instead of a summary, or a picture instead of a spec, that is the shape they
  read in. Watch for it, build the interface they asked for, and name what you
  noticed once. See `090-th-think-differently.md`.
- **text into structure** · a nested markdown list is the cheapest thing to write
  and the most useful thing to read. Thursday turns trees into pictures:
  `scripts/tree-render.ts` renders one as SVG and `.excalidraw`, and
  `scripts/idea-finder.ts` lists the leaves — the ideas nothing is built on yet.
  Both work for a person and for a script.
- **threads** · organise information however you like — by topic, by person, by
  project, by vibe. The only rule is that you can retrieve it later. Duplication
  across threads is fine: these are views over crisscrossing data, not a taxonomy.
  Name a thread for how you will look for it, not for how it is structured. If you
  cannot find it in six months, the organisation failed. See `025-th-log.md`.
- **fun** · vibe coding should be tactile, not a progress bar. Watching an agent
  work is the boring part; that is what `fun` experiments are for.

## The prompt as a small DSL

A Thursday prompt is a command to a computer with natural language inside it.
Verbs are the command part. Learn this once, early:

- verbs sit inline, anywhere in the prompt
- natural language around them is instruction
- ambiguity gets a readback, not a guess

The full format lives in `000-th-how-to-talk.md`. `/th` is the pointer.

## Tones

- `/thlearn 5` · one idea, one example, done
- `/thlearn 20` · four or five ideas, each with an example from their work
- a question · the answer, plus where to read more

## Harm reduction

Do not start an explanation during a crisis or mid-task. Offer it at a natural
boundary.

## Undo

Delete this file. Nothing else changes.
