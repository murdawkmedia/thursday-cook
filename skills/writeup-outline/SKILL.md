---
name: writeup-outline
description: Turn one coding session into a markdown outline a person writes a blog post from. Not a draft — a spine of facts with the user's own prompts preserved verbatim, agent activity as counted tool facts, time-joined commits, beat and screenshot lists. Deterministic: the same session always yields byte-identical output.
whenToUse: The user wants to write about work that happened in a session — a blog post, a retrospective, release notes with a voice. Trigger phrases are "write up this session", "blog post outline", "session outline", "turn this into a post", "what did we do in that session". Load this before quoting any session's user turns as the user's words.
---

# writeup-outline

One session in, one outline out. Multi-session merge is out of scope.

The value is the join, and it is almost entirely mechanical: the prompts are
in the session log, the tool calls are beside them, the commits are in git,
the timings are in both. Nobody has them in one document in order. The script
puts them there. It writes no prose — fragments, lists, tables, timestamps,
quoted prompts. If a section could be pasted into a blog and read as finished
writing, the script is wrong.

## Files

Resolve every file against this skill's base directory.

| File | Purpose |
| ---- | ------- |
| `extract.mjs` | The extractor. Reads the log with Thursday's own session package (`packages/session`: the zstd-container walk plus dsh's own `decodeStorageRecord`). Writes the outline to stdout or `--out`. |
| `beats.json` | Praise/satisfaction phrases that mark narrative beats. Data, not code — adding a phrase needs no code change. |
| `visual.json` | Tool names and file extensions that mark screenshot opportunities. Data, not code. |

## Procedure

1. Resolve the session. A session id (full or prefix) or a path to the session
   directory or log file both work:
   `node extract.mjs --session <id|path> [--project <key>] [--root <dir>]`
2. If the user gives you their own context — a correction, a framing note, a
   detail the log missed — pass it through unchanged:
   `--context "..."` (attaches to the whole outline),
   `--context-file <f>`, and/or `--context-turn <seq>` (attaches to a moment).
   Never paraphrase it. Where it disagrees with session facts, the outline
   shows both adjacent; the tool does not decide which is true.
3. Read the outline before handing it over. Check the `kind:` line first
   (step 5). Check the `Commits` section for the `[inferred]` tag.
4. Hand the user the outline file plus this one-line instruction:
   "Fill in your own voice between the facts; nothing in the outline is
   publishable as written."

## Rules

- Quote depth-0 user turns as the user's words only. The script marks them
  `[user]`. Everything else wearing the `user` role is orchestrator dispatch
  text (`[dispatch]`), a subagent report, or machine noise — never quote those
  as what the person said, in the outline or in chat.
- The script's `[inferred]` tag means a guess. Repeat the tag when you repeat
  the claim. Commit-to-session joins are time-based and wrong across parallel
  work; say so if asked.
- `[⚑ ...]` flags (email, maybe-secret, hostname, path) mark
  likely-sensitive spans in place. They are never redactions: do not delete
  the span, do not decide for the user what is safe to publish.
- Ticket structure is an enrichment, never a requirement. A session with no
  board still yields a time-and-commit outline. Do not demand a board.
- The outline is bounded by construction (12 arc buckets, capped lists). Do
  not paste the raw log into context to "fill gaps" — use
  `thursday session recall <id> <seq>` for the exact original of one moment.
- `extract.mjs` needs the Thursday checkout (`THURSDAY_REPO`, default: two
  directories above the skill) and an installed dsh (for the session package's
  model layer). It needs no board, no network, no model calls.
