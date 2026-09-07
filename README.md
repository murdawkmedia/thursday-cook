# Thursday

Make cheap AI models smart and useful.

Thursday is a full AI development environment built on [DeepSeek Harness][dsh].
It exists because the answer to a weak model should not always be a bigger one.
Planning, bounded tasks, persistent state, and real tool orchestration get more
out of the model you already have.

**Status: pre-alpha.** Nothing here installs yet. The aidos board is the plan
and the sole source of truth for it — there is no separate plan document to
keep in sync.

## What it is for

Thursday has four goals, and every design decision answers to one of them.
Each is stated as the mechanism that delivers it. The four sentences in bold
are canonical and the website reproduces them word for word; the source is
[docs/voice.md](docs/voice.md).

**A wrong tool call is rewritten, not refused.** The guard layer translates a
`find` or `grep` call into the `fd` or `rg` form and runs that, instead of
returning an error the model has to recover from. The approach generalises:
compensate for a weaker model at the system level — planning, context
management, persistent state, task decomposition, validation, reusable
skills — rather than by reaching for a larger model.

**Delegated work returns a result, not the exploration that produced it.** A
delegated ticket gets a written brief and a context of its own. Yours pays for
the brief and the result, not for the reading in between. Correctness is not
the thing traded: the metric is useful work per token, not fewest tokens.

**The plan is written and edited before it becomes tickets.** Planning happens
before expensive execution, when the task earns it. The plan imports to an
aidos board, and a ticket is a bounded task an agent can finish on its own,
carrying its own acceptance criteria and the list of files it may write.

**The agent cannot sign off a ticket, and it cannot mark one done.** Those
tools are not in its tool set, so this is not a rule it is asked to follow.
Before signoff it holds no write tool and no command tool. After signoff, a
write outside the ticket's file allowlist is refused.

## Thursday and Quick

Two presets over one installation, one plugin set, and one configuration. The
difference is workflow overhead, not capability.

**Thursday** is the full environment: aidos, planning, ticketing, background
execution, persistent state, and every supported plugin. The shape of the work
is understand, plan, ticket, delegate, execute in the background, review, and
you decide what happens next. It suits long-running and complex work.

**Quick** is the same system without the ceremony, for tasks where ticketing
would cost more than it returns. Rename this variable. Fix this type error.
Explain this function. Write this small script.

## aidos

aidos is Thursday's planning and ticketing subsystem, not the product. A ticket
moves between states only when the required evidence exists, and the agent
cannot supply the human half: it cannot sign off its own work and it cannot
mark anything done. Before signoff it can read and plan, but it cannot write
files or run commands. Writes stay inside a ticket's file allowlist.

The name is a Greek word for the sense of respect that keeps people honest with
each other. The rules apply to both sides — you cannot drop out of the loop
either.

## v0.1.0

Done when a stranger with no dsh installed runs one command, completes one real
aidos ticket, and can remove Thursday without a trace.

One line per item. Keep it that way: if an item needs a paragraph, it belongs on
the aidos board, not here.

### Install

- [ ] One-command install from trythursday.org
- [ ] Installs into its own Thursday home; your dsh setup is untouched
- [ ] Proves it: a check you can run shows your dsh tree byte-identical after uninstall
- [ ] Installs and pins its own dsh runtime
- [ ] TypeScript installer composed from plugin blocks, not shell
- [ ] Installs the full plugin set, wherever each plugin currently lives
- [ ] Every block records what it changes and why
- [ ] Install and sync are safe to re-run
- [ ] `thursday uninstall` removes it cleanly
- [ ] Linux native, with WSL and Docker supported

### First run

- [ ] Setup wizard for the model provider and profile chains
- [ ] A free-provider chain configured by default
- [ ] You name and own the AI scratch directory
- [ ] First launch opens the tour with the prompt ready
- [ ] `/teach-me-thursday` restarts the tour any time

### The tour

- [ ] Seeded workspace with a plan that imports to a real board
- [ ] Chapter 1: one ticket end to end, you sign off and mark it done
- [ ] Chapter 2: instant `/compact`, then resume recovers what was elided
- [ ] Deleting the workspace leaves no trace

### The environment

- [ ] Thursday preset: planning, ticketing, background execution
- [ ] Quick preset: the same system without the ticket overhead
- [ ] `thursday serve` starts the server; the preset picker chooses between them
- [ ] The aidos board: tickets, evidence, gates, and the plan
- [ ] Semantic design tokens shared by the product and the site

### The website

- [ ] Landing page stating the four goals and the real workflow
- [ ] Install page carrying the command that was actually tested
- [ ] trythursday.org live

### Not in v0.1.0

macOS and Windows install targets; the CI platform matrix; `thursday status`;
the install ledger; the raw request and response inspector; and finishing the
migration out of `aidos` and `dotfiles-ai`. Each is a ticket on the board, and
each is deliberately after this release.

## After v0.1.0

Same rule: one line per item, and an item that needs a paragraph belongs in a
ticket instead.

- [ ] Lua guard rules, run in a WASM sandbox, replacing brittle regex patterns
- [ ] Agent-defined dashboards, rendered through nostr-canvas in a WASM-sandboxed Lua VM
- [ ] An approval surface that only prompts when you are granting something new
- [ ] A workspace panel: file tree, editor, and git diff review without leaving
- [ ] A terminal, human-only by construction
- [ ] Shared boards: a pluggable backing store over git or nostr
- [ ] A plugin registry, and a first-class way to write and publish one
- [ ] macOS and Windows
- [ ] The install ledger, once a block writes outside the Thursday home
- [ ] Supply-chain audit and trust tiers for every third-party plugin

## Repository layout

See the aidos board for the full structure and the reasoning. In short:
`packages/` holds aidos, the install engine, and the plugins; `profiles/` holds
the two presets; `skills/` and `wizards/` hold the agent-facing material;
`website/` and `demo/` hold the public face; `install/` holds the bootstrapper.

## Copy standard

Every string Thursday ships obeys [docs/voice.md](docs/voice.md): this file,
the website, the docs, and everything an agent reads or emits. It fixes the
positioning, the banned constructions, and the one sanctioned offer form.

## License

MIT. See [LICENSE](LICENSE).

[dsh]: https://github.com/deepseek-ai/dsh
