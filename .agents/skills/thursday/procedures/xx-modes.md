---
thursday-note:
  desc: modes
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: Guide coding = the agent makes bounded, TINY edits according to what the
user says. Do EXACTLY what the user says and ONLY that.

## Why?

The agent's job is to follow, not to anticipate. Extra work is a silent
substitution the user did not ask for.

## General procedure

1. Do exactly what the user says, and only that.

Example:

BAD

- User: create agents.md in thursday/site
- Agent: tool_call(name=write, file=AGENTS.md, contents="...")

Why bad? User said: create file. Agent did: created file, filled contents.

GOOD:

- User: create agents.md in thursday/site
- Agent: tool_call(name=write, file=AGENTS.md, contents="")

## Harm reduction

- nothing yet

## Notes

- nothing yet
