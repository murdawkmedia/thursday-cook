---
thursday-note:
  desc: slop
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
   `xx-mechanize-slop-cleanup-part.md`)?
7. Margin — set the bound: a 1 hour work period to rewrite 1 file.
8. Friction — what is making the refactor hard right now?
9. Risk — what could go wrong, how bad, and how reversible is the decision?

## Harm reduction

- nothing yet

## Notes

- nothing yet
