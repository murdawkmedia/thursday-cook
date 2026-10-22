---
thursday-note:
  desc: slop and complexity
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: Dealing with slop. Debt and slop are the same thing — accumulated mess
you are paying interest on.

Slop is not unique to AI. Slop can also be created by humans.

Slop can be thought of as the result of several, small, repeated failures in
situational awareness that have built up in a codebase over time.

Another way to look at it is that slop is the result of several _process_ failures
that have built up over time to cause very little shared understanding of the
codebase to occur.

This could be between the human and the codebase, or between the human as an
agent.

## Why?

Clean up slop from any project.

## General procedure

1. Situation — we are reducing the slop from a system to reduce the workload of
   the humans that are in it. Humans could be users or developers.
2. Scope — the size of the thing from which the slop is being removed.
3. Goal — what is the happy path? What happens when this codebase is fully
   deslopified? What is the concrete signal to call that done?
4. Minimum — the tiniest path to that signal. Read the smallest file in the
   codebase; if it's still huge, read 10 lines. Do it.
   - Who do we have to communicate with about it? Other devs on your team — or
     just refining your own situational awareness.
5. Resources — human cognition is the main one. The biggest contributing factor
   of any successful slop fix is rebuilding the shared awareness as fast as
   possible using progressive disclosure.
6. Pressure — try one action step; we have reduced pressure by starting. Now
   gather data to reduce it further: what is the next biggest pressure, and which
   part of the process are we ready to mechanize (write the first line of
   `user-yyy-mechanize-slop-cleanup.md`)?
7. Margin — set the bound: a 1 hour work period to rewrite 1 file.
8. Friction — what is making the refactor hard right now?
9. Risk — what could go wrong, how bad, and how reversible is the decision?

## Split points

The cheapest complexity is the complexity you did not build yet. When you
anticipate that something will need to grow, add a split point now, while it is
still small:

- a named boundary that can become two things later
- a module that can be lifted out without rewriting its callers
- a data shape that can gain a field without touching every reader

You are buying the option to split later, when the system actually merits it and
you have real data about where the pressure is. Simple things now buy options
later. Defer the complexity and gather the minimum useful data while you do it.

## Start simple

The first version should be the simplest thing that could possibly work, and it
should be cheap enough to throw away.

- a pen and paper beats a database until the paper is full
- a one-line script beats a service
- bash glue beats a framework
- the simplest tool you can start using is one you already have

Starting simple is how you find out what the problem is before you build for it.

## Adding complexity

Complexity is added deliberately, one step at a time, when something concrete is
pressing:

- the simple thing is wrong too often
- the simple thing is too slow
- a person is doing the same step for the third time
- two things genuinely need to be separate

When you add it, say what pressure it answers. If you cannot name the pressure,
you are not adding complexity — you are adding slop.

## Removing complexity

Complexity is removed deliberately too. Removal is a normal move, as available as
adding.

- once nobody depends on a piece, delete it completely. No compatibility shims,
  no commented-out code, no "removed" notes.
- once people do depend on it, removal needs a migration and a revert point
- small pieces, never one sweep
- a thing that has been unused for a long time is a candidate, not a certainty —
  ask before deleting

The rule is symmetric: add when a pressure demands it, remove when the pressure
is gone. Both need a reason and a revert point.

## Literate artifacts

Everything you write should carry its own undo and its own description, in the
same small place. Reading that one thing should be enough to rebuild situational
awareness without reading the whole artifact.

This is the cheapest complexity you can remove. A file that explains itself does
not need a document that explains it.

What belongs in the metadata:

- **what it is** · one line, in the user's words, not the author's
- **how to undo it** · the exact command, or the exact lines to delete
- **when to look at it again** · a revisit date
- **who it is for** · the person, or the procedure that reads it rather than
  guessing

```md
---
thursday-note:
  desc: <one line>
  undo: <command, or what to delete>
thursday-revisit: <date>
---
```

The same idea at other scales:

- a directory gets a short `README.md` or a header comment in its entry file
- a script gets a usage block at the top and `--help`, and both say the undo
- a generated file records what generated it, so the next person does not edit it
  by hand
- a config value records why it exists, not just what it is set to

The test: hand the artifact to someone who has never seen it, in a year. If they
need a meeting to know what it is and how to get rid of it, it is not literate.

Literacy is not documentation. Do not write a companion doc. Put the sentence
where the thing lives.

## Harm reduction

Do not remove complexity people depend on without offering the revert point.
Deslop in small pieces, never in one sweep.

## Undo

Delete this file. Nothing else reads it.
