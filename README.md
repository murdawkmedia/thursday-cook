# Thursday

Make cheap AI models smart and useful.

Thursday is a full AI development environment built on [DeepSeek Harness][dsh].
It exists because the answer to a weak model should not always be a bigger one.
Planning, bounded tasks, persistent state, and real tool orchestration get more
out of the model you already have.

**Status: pre-alpha.** Nothing here installs yet. [PLAN.md](PLAN.md) holds the
implementation plan, and the AIDOS board holds the live version of it.

## What it is for

Thursday has four goals, and every design decision answers to one of them.

**Make cheap models useful.** Compensate for a weaker model at the system level
— through planning, context management, persistent state, task decomposition,
validation, and reusable skills — rather than by reaching for a larger model.

**Get more useful work per token.** Treat tokens as a constrained resource and
cut the waste: repeated context, redundant exploration, poor task boundaries,
premature implementation, lost state. Never at the cost of correctness. The
metric is useful work per token, not fewest tokens.

**Front-load planning.** Plan before expensive execution, when the task earns
it. A plan becomes AIDOS tickets, and a ticket is a bounded task an agent can
finish on its own.

**Keep the user in control.** Explicit permissions, inspectable state, visible
task state, interruptible execution, and reversible operations. Not an opaque
autonomous system.

## Thursday and Quick

Two presets over one installation, one plugin set, and one configuration. The
difference is workflow overhead, not capability.

**Thursday** is the full environment: AIDOS, planning, ticketing, background
execution, persistent state, and every supported plugin. The shape of the work
is understand, plan, ticket, delegate, execute in the background, review, and
you decide what happens next. It suits long-running and complex work.

**Quick** is the same system without the ceremony, for tasks where ticketing
would cost more than it returns. Rename this variable. Fix this type error.
Explain this function. Write this small script.

## AIDOS

AIDOS is Thursday's planning and ticketing subsystem, not the product. A ticket
moves between states only when the required evidence exists, and the agent
cannot supply the human half: it cannot sign off its own work and it cannot
mark anything done. Before signoff it can read and plan, but it cannot write
files or run commands. Writes stay inside a ticket's file allowlist.

The name is a Greek word for the sense of respect that keeps people honest with
each other. The rules apply to both sides — you cannot drop out of the loop
either.

## Repository layout

See [PLAN.md](PLAN.md) for the full structure and the reasoning. In short:
`packages/` holds AIDOS, the install engine, and the plugins; `profiles/` holds
the two presets; `skills/` and `wizards/` hold the agent-facing material;
`website/` and `demo/` hold the public face; `install/` holds the bootstrapper.

## License

MIT. See [LICENSE](LICENSE).

[dsh]: https://github.com/deepseek-ai/dsh
