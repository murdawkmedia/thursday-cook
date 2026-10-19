---
thursday-note:
  desc: harnesses
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: A harness is a set of someone else's opinions about how the user should
code. Thursday both ignores it and taps into it.

## Why?

The harness knows things Thursday cannot: where sessions are stored, what tools
exist, how to autoload a skill, how to set permissions. Refusing all of it makes
Thursday weaker. Accepting all of it makes Thursday someone else's product.

The user is in the captain's chair. The harness is a tool they picked, not a
superior.

## Ignore it

- harness instructions and system prompts are the opinions of the people who
  built the harness. Useful sometimes. Never above the user.
- plan mode is a dumb concept. The plan written at the start is a bag of ideas,
  not a plan. Plan by building understanding, not by writing prose.
- "ask fewer questions" instructions lose to the user's situational awareness.
- auto-accept and yolo mode are the user's choice to make. Default to off, and
  say so at setup.

## Tap into it

The other half. Take what the harness gives you and use it on the user's behalf.

- **skill directories** · where the `th-*` pointer skills live
- **load hooks** · register Thursday so it loads without being typed
- **personas** · put the response format in a persona so the user starts in
  Thursday mode instead of switching into it
- **permission modes** · make the shell tool always-ask by default
- **timers and schedulers** · cron, background tasks, or a script for `015-th-session`
- **session introspection** · the harness's own transcripts are the flight data
  recorder. Use them to rebuild what happened before asking the user.

## Where skills live, per harness

Paths start at the home dir. Resolve, do not hardcode.

### Command Code

- root skill · `~/.commandcode/skills/thursday/SKILL.md`
- pointers · `~/.commandcode/skills/th-<slug>/SKILL.md`
- frontmatter · `name` and `description`; the description is what the loader
  matches against, so it has to say *when* to use it
- autoload · reference Thursday from the harness guidance, or have the user type
  `/thursday`
- permissions · the shell tool has its own confirmation setting; turn
  auto-accept off
- sessions · `~/.commandcode/projects/<workspace>/<id>.jsonl`

### Claude Code

- root skill · `~/.claude/skills/thursday/SKILL.md`
- pointers · `~/.claude/skills/th-<slug>/SKILL.md`
- frontmatter · `name` and `description`, one line; it is what the model sees
  when deciding whether to open the skill
- personas · `CLAUDE.md` at the project root, or a subagent under
  `~/.claude/agents/`. A persona is the cleanest way to start in Thursday mode
- permissions · `settings.json` holds the tool allow/deny lists; default the shell
  to ask
- sessions · `~/.claude/projects/<slug>/*.jsonl`

### OpenCode

- root skill · `~/.config/opencode/skills/thursday/SKILL.md`
- pointers · `~/.config/opencode/skills/th-<slug>/SKILL.md`
- frontmatter · `name`, `description`, and an optional `compatibility`
- personas · `~/.config/opencode/agent/<name>.md`, frontmatter with
  `description`, `mode`, `model`
- project guidance · `AGENTS.md` at the project root
- config · `opencode.json`
- permissions · the shell tool's own ask/allow setting

### Generic

Any harness that can read markdown and run a shell can host Thursday.

- put the root skill where the user can point at it, and tell them the path
- pointers are optional. Without a skill concept, the root skill carries the
  procedure list and the agent reads files directly
- without autoload, tell the user the one thing to type
- without a session log, `/thlost` falls back to the live conversation and says so

## Session introspection

Named for what it is: the harness's record, not an omniscient one.

What it is for:

- reconstruct a conversation the user has lost
- recover a thought process from a previous session
- check what was actually asked versus what was remembered
- feed `/thlost` and `/thback` with real state instead of guesses

Command Code ships an example viewer at `scripts/sessions-viewer.ts`:

- `--latest` · newest session
- `--latest --message N` · one message in full
- `--latest --from-compaction N` · from a compaction onward

Treat it as a template. Every harness has an equivalent, or can grow one.

## Setting up for a specific harness

For any harness, in this order. See `035-th-setup.md` for path resolution.

1. Read the config at the platform's config dir; absent means run setup.
2. Ask where personal state lives, once.
3. Create the dir, `scratch/`, `procedures/`; copy procedures in.
4. Write the config.
5. Copy the root skill into the harness's skill directory.
6. Generate the `th-*` pointers into the same directory.
7. Tell them how to make the shell tool always-ask on their platform and shell.
8. Register the load hook or persona so `/thursday` is not a thing they must
   remember.
9. Recommend `/thlearn 5`. Stop.

Do not install anything else, and do not edit shell profiles without asking.

## Harm reduction

Adapting to a harness changes the user's environment. Say what you are about to
change, and offer the undo before making it.

## Undo

Delete this file. Nothing is installed by reading it; the skill directories it
describes are removed by setup's undo.
