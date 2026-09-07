# Design principles

Stated because they are decided rather than felt, and because several decisions
already made are instances of them that nobody had named.

## The goal these serve

**Share the intelligence of your precious, limited frontier model with your cheap
models.**

The frontier model is scarce — rate-limited, expensive, and capped in ways that
bite in the middle of real work. Its intelligence, though, is not consumed when
it is used: a good decomposition, a written criterion, a rule extracted from a
failure, all keep working after the model that produced them has hit its weekly
limit.

So the product's job is to CAPTURE that intelligence and hand it to models that
could not have produced it. Everything below is a way of doing that, and the
three ways form an order of preference.

**First, convert it into determinism.** The strongest form of sharing, because
the result costs nothing per use and cannot drift. The knowledge that `find`
should be `fd` became a guard translation, so every cheap model gets it forever
without spending a token on the insight. A day spent discovering that a repair
tool measured its own reader became a test that fails when it happens again.
Intelligence turned into arithmetic is intelligence that scales to zero cost.

**Second, encode it as structure a cheap model can follow.** Where the thing
genuinely needs judgment, give the judgment a shape: a plan decomposed into
bounded tickets, criteria describing what good looks like, a skill written once,
a catalogue of mutation types to walk rather than invent. Cheap models do
enumeration well and synthesis badly, so structure is the difference between a
capable executor and a confused one. The 2026-09-07 investigation measured this:
asks with a crisp completion signal survive, and judgment calls silently
evaporate.

**Third, and last, spend the model itself.** Partner review exists because some
questions cannot be reduced to a check or a checklist — whether a change is
actually correct, whether a design has a flaw. Reserve the scarce thing for the
questions that genuinely require it, which is what the partner chain is and why
it is deliberately expensive.

The two principles below are how that is done in practice.

## Use a model only where determinism is impossible

An LLM is the most expensive, least repeatable component available. Every
mechanism that can be deterministic should be, and a model should appear only
where the work genuinely cannot be done any other way.

This is not a preference for austerity. A deterministic mechanism is faster,
cheaper, testable, identical on every run, and debuggable by reading it. A model
in the same position is none of those, and it fails in ways that look like
success.

### The two worked examples

**Instant compaction is the good case.** Summarising a session is an LLM task by
default: send the transcript, wait for a model to write a precis, hope it kept
what mattered. `dsh-compaction-instant` replaces that with a deterministic fold —
it runs immediately, produces the same result every time, and can be checked by
reading it. It turned a model action into a computation, and everything improved
at once: latency, cost, reproducibility, and the ability to test it.

**`dsh-better-edit` is the bad case, and it is instructive because the intent was
good.** `str_replace` editing already worked. The experiment replaced it with a
mechanism that depended on the model's ability to do a new thing, so a capability
that was deterministic became contingent on inference. When the model got it
wrong, an operation that used to be reliable started failing. Taking a working
deterministic mechanism and making it model-dependent is a regression however
elegant the new design is.

**Hashline edits failed the same way**, from the other direction: addressing
lines by content hash is a sound idea that requires the model to emit exact
hashes, which is out of distribution for small models. Recorded in the
experiments index as decided-against, with the general lesson: a mechanism that
requires a model to emit tokens it has never seen the shape of will fail however
well it is designed.

### The corollaries

**Where a model is genuinely required, constrain its output mechanically.** Do
not ask for precision; make imprecision impossible. AL2's ask extraction is
grammar-constrained so malformed output cannot be produced, rather than being
discouraged in a prompt. That is the direct inverse of the hashline failure.

**Never let a model report on itself where the fact can be observed.** Derive the
answer from state instead. The tutorial's steps complete because the ticket
actually moved, not because the agent said so. A repair is accepted because dsh's
own loader opens the file, not because our reader does. On 2026-09-07 eight
reports claimed verification that had not happened; not one would have survived a
check against real state, and each of those checks was one command.

**No model in an enforcement or detection path.** A model that forgets a rule
also forgets to report forgetting it, so guards, gates and detectors are
deterministic or they are decoration. The meridian circuit-breaker fires on a
parsed response with no inference anywhere, which is what makes it behave
identically every time — including when the model that would otherwise have
handled the error is the thing that cannot be reached.

**Prefer the version with nothing to verify.** The cheap implementation is often
only cheap while it is unverified. The tutorial spotlight could raise the target
element's z-index and revert it — two lines, until you add the fixup for static
positioning, the exact revert on three lifecycle paths, the check that the lift
actually worked, and the fallback for the stacking contexts that defeat it.
Drawing the backdrop as four rectangles around the target touches nothing and can
fail in no such way. Doing it properly was fewer moving parts than doing it
cheaply.

## What this does not mean

It does not mean avoiding models. Thursday exists to make them useful, and the
work they are genuinely good at — reading unfamiliar code, drafting, explaining,
judging what a person meant — is the product.

It means not spending them on work that arithmetic could do, and never placing
them where a wrong answer is indistinguishable from a right one.

## The agent waits on the user, never the reverse

Where there is an asymmetry, put the waiting on the machine's side. The scarce
resource is the person's attention, and the cheap-model investigation of
2026-09-07 reached this from the economics: cheap tokens are roughly twenty times
cheaper against a 2.2x surviving-line disadvantage, so what they actually cost is
human attention. Every mechanism should be judged by how many interrupts it
removes, not by how many tokens it saves. A change that does not reduce
interrupts is decoration.

**Restarting dsh is the motivating case.** Applying a plugin or composition
change requires a restart, because bundle rows are static per boot. Today that
costs whatever is in flight, so people defer it — the `message-feedback` rows
were disabled on 2026-09-05 and the restart to apply them still has not happened,
because the session doing the work is the session that would die. The user is
waiting on the machine's inability to stop gracefully. `restart-pause` inverts
it: the machine quiesces, restarts, reconnects and resumes, and the person does
nothing but decide.

### What it means in practice

**Never ask a person to poll.** Tell them when the thing is ready. Background
jobs announce completion, subagents deliver a notice, the board digest arrives on
change, and an approval request returns immediately rather than blocking — the
agent is steered when the human acts. An agent that polls is also violating this,
in the other direction, by making itself wait when it could be told.

**Batch what a person must approve, at the start.** REL2 says it plainly:
someone asked to approve a seventh thing mid-flight becomes the bottleneck the
parallelism was meant to remove. On 2026-09-07 three fronts sat idle waiting on
allowlists that could have been requested before any of them was dispatched. The
work was right; the ordering made a person the critical path.

**Prefer parking to interrupting.** A gate that cannot be evaluated parks the
ticket rather than raising a question immediately. The work waits, which costs
nothing, instead of the person being pulled out of what they were doing.

**When a person must decide, make one decision sufficient.** Give them
everything needed in one place: a dependency proposal shows what becomes
startable, not a list of arrows; a review nomination says which ticket and why.
A decision that requires the person to go and gather context first is really
several interrupts wearing one coat.

**Idle agents are fine; idle people are waste.** An agent blocked on a human is
working as designed. A human blocked on an agent means something should have been
prepared, batched, or backgrounded.

## Never ask for a judgment without supplying the instrument

Where a model must judge, hand it the thing that makes the judgment checkable: a
criterion, a rubric with thresholds, worked examples of both answers, a list to
enumerate, or — best — a script that decides and removes the judgment entirely.
An unaided judgment call is the weakest instruction that can be given, and it is
the default one.

This is the operational form of the second tier above. "Encode it as structure"
is the goal; supplying the instrument is what it means on any given day.

**The failure is silent, which is what makes it dangerous.** A model asked to
judge without a rubric does not answer "I cannot tell". It answers confidently,
in the shape the question implied, and the answer is unfalsifiable because there
was never a standard to fail. The 2026-09-07 investigation measured the pattern:
asks with a crisp completion signal survive in cheap models, judgment calls
evaporate — and the evaporation leaves no trace. The eight false verification
reports of the same day were all this: "verify the work" is a judgment; "run this
command and paste the output" is not.

### The ladder, strongest first

1. **A script that decides.** The judgment stops being one. "Is the bundle too
   large" becomes a size check in CI.
2. **An enumeration to walk.** S5 ships eleven mutation types with what each
   breaks, because selecting from a list is a task cheap models do well and
   inventing the list is one they do badly. S9 offers five kinds of protective
   artifact and requires a choice from them.
3. **A rubric with thresholds.** Not "is this ticket well scoped" but the
   conditions under which it is not: needs its own sub-checklist, touches more
   than a few related files, has no decided design.
4. **Worked examples of both answers, including the boundary.** See below.
5. **Bare judgment.** Legitimate only where the question genuinely resists all
   four — and then it goes to the partner chain, which is what that chain is for.

### The corollaries

**Give the negative examples, not only the positive ones.** A rubric that shows
only what qualifies makes everything qualify, because a model matching against
one-sided evidence has no way to say no. Name what does not trigger the rule and
name the case that sits closest to the line, since that is the one that will
actually be encountered.

**The rubric must be checkable by someone who was not in the conversation.**
That is the test for whether it is a rubric at all. Criteria that only make sense
to the person who wrote them are notes, and they will be read by a cheap model
in a fresh session with none of the context that made them obvious.

**If the rubric cannot be written, the ask is not yet understood.** This is the
most useful side effect, and it fires before any work is done. An ask that
resists having criteria written for it is underspecified, and the failure to
write them is the discovery — not an excuse to proceed on vibes. Every ticket
carrying explicit criteria is this principle applied to planning; the criteria
are not documentation of the ticket, they are what makes it dispatchable.

**Prefer the instrument that also runs later.** A script keeps deciding after the
session ends; a rubric in a prompt decides once. Where both are available at
similar cost, the durable one is worth more than its marginal accuracy, for the
same reason the first principle prefers determinism: it is intelligence captured
rather than intelligence spent.
