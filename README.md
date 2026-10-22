# Thursday

Situational awareness for humans: aviation-inspired workflows that meet people
where they are.

Thursday is a set of ideas

- to help people
- build systems
- to achieve
- their own goals
- safely
- by making tiny changes
- one at a time.

## Experiments

- [Idea Expander](https://trythursday.org/experiments/idea-expander)
- (coming soon, the new Idea Expander) [Thing Refiner](./experiments/thing-refiner.jpg)
- (coming soon) [Next Steps](./experiments/next-steps.jpg)
- [AI For All](https://ai-for-all.trythursday.org), free, Proof-of-Work gated
  AI inference - no sign-up needed.

### The Thursday skill file

**Try it in your coding agent today:**

- Paste:

  > I want to try https://github.com/trythursday/thursday. Can you help me set
  > it up?

- Then type:  
  `/th`

Requirements: [`bun`](https://bun.sh), `git`, and a coding agent to run it in.

## Setup

Setup is a procedure your agent follows, not a script. Ask it to install Thursday
(or type `/thursday`) and it will run `procedures/035-th-setup.md` for you.

It writes four things, and each one names how to undo it:

- a personal folder — your own procedures, scratch, and notes
- the config dir — `thursday.toml`, the only static path; everything else resolves
  from it
- the state dir — logs, caches, and schedules
- the skill itself — the root skill plus one skill per verb

Delete those four and Thursday is gone. Nothing else is written, and no shell
profile or global config is touched without asking.

## In this repo

- `.agents/skills/` - the Thursday root skill, and one generated skill per verb
- `procedures/` - one concept per file; each carries its own description and undo
- `threads/` - experimental info organization system
  - `threads/personal/` - gitignored, personal info at the relevant scope
- `experiments/` - prototypes and ideas.
- `scripts/` - Thursday tools, for people and machines

## License

I want you to steal thursday. I ENCOURAGE you to steal thursday.
I want this skill file in as many agents as possible. If frontier labs think
this is useful and run it in their AI factories 24/7 - that's just increasing
the size of my database ;) My ultimate goal is world peace. Thursday is a system
to work towards any goal by breaking it down into small, actionable tasks.
If you steal it and help people remember about humans and fun, you are just
helping the cause of world peace! So do it :)

In exchange I ask that you [write my name down](./LICENSE.md) somewhere in a
little corner of your project.

---

Created: 2026-10-12
Revisit: 2026-11-12
