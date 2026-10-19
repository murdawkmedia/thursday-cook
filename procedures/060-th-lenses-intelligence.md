---
thursday-note:
  desc: lenses and the intelligence ladder
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: Thursday is a system for selecting views over crisscrossing data, and
for choosing how much intelligence to spend on a step. Each lens reduces the
search space. The ladder decides what runs the result.

## Why?

A problem can look unsolvable through one lens and like a single next step
through another. Thursday assumes you have infinite time, then finds the minimum
useful thing you can do to start.

The ladder matters because intelligence is a cost, not a virtue. Reaching for the
most capable tool every time is how small problems become expensive ones, and how
people end up unable to work when the capable tool is unavailable.

## The lenses

1. Scope — the current zoom level: step up, down, or sideways. Scope decides the
   meaning of "minimum useful".
2. Situation ↔ Goal — is there a situation right now? Where do we want to go?
   Goals are nested, concrete, and must be bounded.
3. Margin — room for error, delay, or unexpected events. What is the current time
   estimate, and what bound tells us whether the estimate was accurate? Example:
   set a 1 hour work period to rewrite 1 file.
4. Minimum — the tiniest possible path. What is the smallest useful thing we can
   do right now?
5. Pressure — time is the greatest pressure of any problem; start by assuming it
   is the only one. Cost to act vs cost to wait; how can we reduce the cost of
   waiting?
   - Try one action step — we have reduced pressure by starting.
   - Gather data to reduce it further: how long is it taking? what is the next
     biggest pressure? how do we make the process more reliable? what do we
     understand well enough to mechanize?
6. Resources — what do I have? add / cut / reallocate.
   - Human cognition — work up or down the ladder below.
   - People, financial, experiences, memories, moments, ideas.
   - Infinite time — not really, but a useful first step to start working from.
7. Unknown — what don't we know? enough data to decide? (+ / -)
8. Friction — what makes action hard? remove it, and add the minimum needed to
   avoid latent pressure down the line.
9. Risk — what could go wrong, how bad, and how reversible is the decision?
10. Impact — what is the highest-human-impact thing we can unlock through the
    minimum series of steps?

## The intelligence ladder

Rungs, cheapest and least capable first.

- **do nothing** · often correct. Revisit later, or never.
- **the user** · a person who already knows. Fastest when they do, and it keeps
  the knowledge where it belongs.
- **a deterministic script** · if the answer is always the same, encode it. One
  line of bash beats a paragraph of reasoning.
- **a heuristic or checklist** · a procedure. The human understands it, writes it
  down, and it runs the same way every time.
- **a small model** · when the step needs judgement but not genius. Cheap, fast,
  cancellable without guilt.
- **a frontier model** · when the step genuinely needs the top of the range.

## Working the ladder

- **start low.** Ask whether the rung below would do. Most steps that reach for a
  model are a script with extra words.
- **move up deliberately,** when the current rung is causing pressure: it is
  wrong too often, it is too slow, or a human is doing it repeatedly.
- **move down deliberately,** when a higher rung is overkill, too expensive, or
  unavailable. This is the skill that survives the tool disappearing tomorrow.
- **encode what you learn.** Once a human understands a process, write it as a
  procedure. That is a rung of its own, and the most durable one.
- **name the rung** when the choice matters, so the user can disagree with it.

## Autonomy and the ladder

Higher rungs can act without a human in the loop; lower rungs usually cannot.
That is where autonomy comes from — not from a mode switch.

- a script or a checklist can run unattended
- a model needs a bounded task and a reviewable result
- **autonomous intelligence use** is earned, not granted: the user has a plan,
  has a prototype they are happy with, and has chosen the tools. Then the agent
  can formalize the prototype into the product without asking at every step.
- shared awareness is the precondition. No shared picture, no autonomy.
- when in doubt, drop a rung and ask.

## Duality

- solve the same problem many different ways. solve many problems in one way.

## Favourite numbers

- 0: can we do nothing? Ideal case. Do nothing.
- 1: can we do a single thing right now?
- 2: do we have a binary choice we can make right now? Can we narrow the search
  space by half? Can we double our possibilities?
- Infinity: what's the biggest constraint? What happens if we pretend it doesn't
  exist?

## Harm reduction

The first, most important check in any session should be operator fatigue, and
before then, establishing the goal of the current work period, the stop time,
and the check-in time.

Automating a rung the user still wants to do by hand is a harm. Ask before
climbing.

## Undo

Delete this file. Nothing else reads it.
