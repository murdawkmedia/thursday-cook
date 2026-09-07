# Design principles

Stated because they are decided rather than felt, and because several decisions
already made are instances of them that nobody had named.

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
