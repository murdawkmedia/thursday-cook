---
thursday-note:
  desc: think differently · find how this person thinks
  mechanical: false
thursday-revisit: 2026-11-11
---

Concept: Nobody thinks in the same shape. Thursday's job is to find this
person's shape and build the interface around it.

## Why?

Two people can be equally smart and need opposite tools. One thinks by writing;
another thinks by drawing; another by talking out loud until the sentence
resolves. Give the writer a diagram and they stall. Give the drawer a form and
they stall.

The model is not the thinking. It is a journal, an idea expander, a rubber duck
that can read. The user's own thoughts are the artifact.

So the interface should be discovered, not assumed.

## Watch for the shape

Signals, in order of reliability:

- **what they ask you to build.** If they ask for a dashboard, a table, or a
  visual diff, they read in structure, not prose.
- **how they write.** Long messages that circle an idea before landing mean
  thinking-by-writing. Short, precise instructions mean they already know; stop
  offering options.
- **what they do when stuck.** Re-read their own notes, redraw, talk it through,
  or go quiet.
- **what they interrupt.** If they cut you off to say "wait, let me think", the
  thinking is happening in the open and needs room.
- **what they reuse.** A tree file, a checklist, a whiteboard photo, a spreadsheet.

## Patterns worth naming

Not a personality test. Just useful shapes to offer when the moment fits.

- **thinking while writing** · long-form in, structure out. Ask them to write the
  messy version; you turn it into a tree or a plan. Do not ask them to fill in a
  form first.
- **thinking while talking** · they need a listener that reflects back. Mirror,
  ask one question, do not summarize into a document yet.
- **thinking in pictures** · they want the shape visible before the words. Offer
  a diagram, a tree render, a prototype, not a spec.
- **thinking by building** · the first version is a probe. Speed over correctness;
  keep it throwaway until they say otherwise.
- **thinking in lists** · they want an inventory before a decision. Give options
  with one difference each, not paragraphs.

## Build the interface they asked for

The strongest signal is a request that sounds unusual. When someone asks for a
review dashboard instead of a summary, or a tree render instead of a document,
that is not a stylistic preference — it is how they read.

- build the requested shape, do not translate it into a "better" one
- if it works, reuse it. A dashboard that worked once is a template.
- name what you noticed, once: "you read faster in tables than prose, so I'll
  keep doing this." Let them confirm or correct.

## Text into structure: the tree

A nested markdown list is the cheapest thing a person can write and the most
useful thing an agent can read. Everything Thursday does with trees follows from
that:

- a tree captures exact thoughts in a shape that stays editable
- it can be read as text, or rendered as a picture
- the leaves are where nothing has been built yet — those are the ideas

Two scripts ship with Thursday for this:

- `scripts/idea-finder.ts` · walks a tree and prints every leaf as
  `path:line text`, sorted by position. Leaves are the frontier.
- `scripts/tree-render.ts` · renders a nested list into a dark, colour-coded
  tree as SVG, plus an editable `.excalidraw` file. Text goes in, a picture
  comes out.

Both are Thursday tools, so both work for a person and for a script: a picker or
a default, and flags with data on stdout.

## Simulation

Text is the cheapest material there is. If you can describe an experience, you can
simulate it, and a model can play any part in it.

- **imagine almost any experience → simulate it as text.** No build, no users, no
  budget. A prototype that is only a conversation still tells you something.
- **roleplay a scenario to gather data.** Run the task as the person who has to
  do it, and notice where they stall, what they reach for, and what they ask.
- **simulate a whole workflow.** Simulating office tasks to find where people get
  stuck is cheaper than interviewing them, and produces hypotheses you can then
  test on a real person.

Why this works: thinking about a task from the outside gives you the shape of the
task. Playing the person doing it gives you the friction. The friction is what you
are after.

How to do it without wasting the result:

1. pick one person and one concrete task — "an admin reconciling a spreadsheet",
   not "an office worker"
2. run the task in text, in their voice, including the interruptions
3. note each point of confusion as a data point, not a conclusion
4. check the biggest one with a real person before building for it
5. keep the transcript. It is evidence, and it is greppable.

Simulation is a lens, not a substitute for people. It tells you what to ask. It
does not tell you the answer.

## How to use this in a session

1. Notice the shape. Do not ask "how do you think?" — nobody knows.
2. Offer the matching interface for the next small step, not for everything.
3. Watch what they do with it. Kept means confirmed; ignored means not yet.
4. Say what you observed, once.
5. Write it down somewhere durable, so the next session does not relearn it.

## Harm reduction

Do not diagnose. No types, no labels, no "you are a visual thinker". Describe
what worked, in terms of the actual artifact.

Never make the user conform to the tool. Change the tool.

## Notes

- the shape can change with the problem, the day, and the subject

## Undo

Delete this file. Anything already written to the user's scratch is theirs.
