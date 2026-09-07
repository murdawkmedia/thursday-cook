---
name: thursday-doctor
description: Diagnose a Thursday installation and its session logs — which plugins are actually mounted, whether the live composition matches what packages/blocks declares, and whether a session log is structurally sound. Use when Thursday misbehaves after an install or upgrade, when a plugin or tool is missing, when a session will not resume or looks truncated, or when the user asks what is wrong with their Thursday/dsh setup.
whenToUse: Thursday or dsh is broken, a plugin is not loading, a session will not resume or has lost content, an install or upgrade left the machine in an unknown state, or the user asks to check/diagnose/verify their Thursday installation. Trigger phrases are "thursday doctor", "diagnose my install", "why is this plugin missing", "what is wrong with my setup", "this session is corrupted", "check my thursday installation".
---

# thursday-doctor

Diagnose a live Thursday installation and its session logs.

**This skill assumes NOTHING about your tools beyond the dsh baseline: `bash`,
`read`, `write`, `edit`, `grep`, `glob`.** It does not need Thursday's board
tools, its session tools, or any Thursday-specific tool. Everything below is
driven from `bash` plus reading files. If you happen to have richer tools, use
them; nothing here depends on it.

## The one rule

**Diagnosis never modifies anything.** Every command in sections 1–5 is
read-only. Only section 6 writes, it always writes a COPY, and it never touches
an original until the user says so in words. If you find yourself about to run a
write command in a diagnosis, stop: you have left this skill.

## 0. Find the pieces

Three things exist and you need to locate each one. Do not assume the paths.

```bash
# The Thursday checkout (has packages/blocks and packages/install)
for d in "$PWD" "$PWD/thursday" "$HOME/repos/thursday" "$HOME/thursday"; do
  [ -d "$d/packages/blocks" ] && echo "REPO=$d" && break
done

# The live installation (the one with a mounted web profile)
for d in "${THURSDAY_HOME:-$HOME/.thursday}/dsh" "${DSH_HOME:-$HOME/.dsh}"; do
  [ -f "$d/profiles/web/cordis.patch.yml" ] && echo "DSH=$d"
done

# Session logs
for d in "$HOME/.dsh/sessions" "${THURSDAY_HOME:-$HOME/.thursday}/dsh/sessions"; do
  [ -d "$d" ] && echo "SESSIONS=$d" || true
done
```

Test each path rather than `ls`-ing them together: on a machine where only one
exists, a combined `ls` exits non-zero and looks like a failure when it is
simply the normal single-install case.

**If more than one installation has a web profile, say so and ask which one the
user means before reporting anything.** Reporting "nothing is installed" against
an empty configured home while a live install sits beside it is the single most
misleading thing this skill can do.

## 1. Run the real tool first

Thursday ships the checks as a program. Run it. Do not re-derive its answers by
hand — it calls the installer's own detect functions, so its answer is the
installer's answer, and yours would not be.

```bash
cd "$REPO"
node packages/session/bin/thursday-session.mjs doctor --repo "$REPO"
```

Exit codes: `0` clean, `1` errors found, `2` bad usage, `4` could not locate a
substrate package (dsh or the compaction fork).

Add `--verbose` to see every detect step rather than only failing ones,
`--json` for machine-readable output, `--dsh-path <dir>` to force which
installation is inspected.

**If that command fails to run**, the tool itself is the problem — fall through
to section 2, which needs nothing but `bash` and `read`.

### Reading its output

Three blocks come back.

- **block drift** — one line per block in `packages/blocks/`, with the fraction
  of that block's own `detect:` steps that pass against the live filesystem.
  - `ok` — every detect step passes.
  - `ABSENT` — none pass. The block is simply not installed.
  - `PARTIAL` — **the important one.** Some of the block installed and some did
    not. Worse than absent, because the installer's own `detectBlockStatus`
    treats any failing step as "not installed" and re-runs the whole block.
  - `UNKNOWN` — a detect step threw. The state is genuinely unknown, which is
    NOT the same as absent. Report it as unknown.
- **composition** — rows the blocks declare vs rows in the live
  `cordis.patch.yml`. A missing row means the plugin is not mounted at all.
- **findings** — each with `at` (where), `why` (the mechanism), and often `fix`.

Report the `why`. "aidos is not mounted" is a symptom; "the blocks declare an
`aidos` insert row and the live composition has none" is a diagnosis.

## 2. Fallback: check the installation by hand

Only if section 1 could not run. This uses nothing but `bash`, `read` and `grep`.

```bash
# What is actually mounted
grep -E '^\s*-?\s*id:' "$DSH/profiles/web/cordis.patch.yml"

# What the blocks declare — every block's id and its detect steps
grep -l '^id:' "$REPO"/packages/blocks/*.md 2>/dev/null
grep -A3 '^detect:' "$REPO"/packages/blocks/*.md

# Is a package actually installed?
ls -d "$DSH"/profiles/web/node_modules/@deepseek-ai/* | sed 's|.*/||'
```

Compare the two lists by hand and report the difference. Say explicitly that you
did this by hand because the tool would not run, and say why it would not run —
a hand comparison can drift from the installer's real rules, and the user needs
to know which kind of answer they are getting.

## 3. Inspect a session

Never `cat` a session log. They are Zstandard-compressed JSONL and they are
large — a real one measured 9.7 MB and 198 527 events, about 59 MB of JSON.
Dumping one costs you the context you need to diagnose with. That is the exact
failure this tooling exists to prevent.

```bash
# Which sessions exist (reads only each log's header — fast on huge logs)
node packages/session/bin/thursday-session.mjs list --limit 20

# A bounded, readable summary: ≤2000 tokens, ≤160 lines, ≤12 turn digests
node packages/session/bin/thursday-session.mjs show <session-id>

# Find something without reading the whole log
node packages/session/bin/thursday-session.mjs search <session-id> 'some regex'

# Pull the EXACT original content behind a pointer the summary showed you
node packages/session/bin/thursday-session.mjs recall <session-id> seq 1234
```

`recall` also takes `result <seq>` for a tool result and `checkpoint <n>` for
the n-th compaction checkpoint (`1` is the oldest). Only use `checkpoint` when
`show` or `fold` reported a non-zero checkpoint count — asking for one that does
not exist is an error, exit `2`, with a message naming how many the session has.

`show` is a fold, not a dump: per-turn it gives the ask, the tools used as a
histogram, the last thing the assistant said, and how the turn ended. When you
need more, `search` then `recall` a specific pointer. The log is append-only, so
nothing the summary elided is lost — it is one `recall` away.

Note: a dsh project directory key literally begins with `--` (e.g.
`--home-sid-repos-thursday--`). Pass it as `--project=--home-sid-repos-thursday--`;
the space-separated form cannot be parsed.

## 4. Understand a projection

When a session "lost" content or a compaction looks wrong:

```bash
node packages/session/bin/thursday-session.mjs fold <session-id>
```

This reports what the surface projection folded to: how many events are in the
log, how many are model-visible now, each replacement's declared range, how many
surface entries it actually shadowed, and what the checkpoint that replaced them
says. A replacement that shadowed **zero** entries is a compaction that cost
tokens and freed nothing.

Remember the shape of the system before you call anything lost: the log is
append-only. A compaction does not delete; it adds a checkpoint node that
shadows a range. Every shadowed event is still in the file, and `recall` returns
it verbatim.

## 5. Diagnose a session log

```bash
node packages/session/bin/thursday-session.mjs diagnose <session-id> --prove-readonly
```

`--prove-readonly` checksums the artifact before and after and prints both. It
exits `3` if they differ. **Use it, and paste the two checksums into your
report**, so the user can see the diagnosis did not touch the file rather than
taking your word for it.

Defects it reports, and what each actually means:

| code | meaning |
|---|---|
| `torn-tail` | the last Zstandard frame is incomplete. The ordinary result of a process killed mid-append. Everything before it is intact. |
| `unparsable-line` | a record is not valid JSON. Whatever events it held are unreadable. |
| `undecodable-record` | dsh's own decoder rejected a packed chunk row. One row can hold hundreds of assistant deltas, so this is real loss. |
| `duplicate-seq` | two records claim one seq. The second is unreachable, so `recall` silently returns the wrong one. |
| `seq-gap` | seqs are not contiguous. Search stops seeing events past the gap. **Not repairable** — the missing events do not exist. |
| `surface-inconsistent` | dsh's own `foldSurface` rejected the log. The projection genuinely disagrees with the events. |
| `compaction-unmatched-start` | a compaction began and never landed; its durable lock is still held and the session cannot compact again. |
| `open-turn` / `unbalanced-tail` | the final turn has no `turn/end`. Normal for a session running *right now*; a defect for one that is not. |

Check whether the session is currently running before calling an open turn a
defect. `ls -la` the log: a recent mtime on a live machine means it is in use.

## 6. Repair — only with the user's explicit consent

Repair is destructive-capable. The rules are not negotiable.

**Always plan first. Show the plan. Get a yes in words.**

```bash
node packages/session/bin/thursday-session.mjs repair <session-id> \
  --close-turns --dry-run
```

The plan prints each operation with its `why` and, where it costs something, its
`cost`. Show that to the user verbatim. Then, once they agree:

```bash
node packages/session/bin/thursday-session.mjs repair <session-id> --close-turns
```

This **writes a copy and leaves the original alone.** It then prints a
good-data proof: how many records the original had, how many the plan dropped,
how many it appended, and how many survivors are byte-identical in the copy. If
`ALL GOOD DATA SURVIVED` is not `true`, the tool refuses to offer promotion —
do not work around that.

Only after the user has seen the proof and asked for it:

```bash
node packages/session/bin/thursday-session.mjs repair <session-id> --close-turns --confirm
```

Even `--confirm` does not delete: the original is renamed to
`session.jsonl.zstd.superseded-<timestamp>` and the command prints a one-line
`undo`. Give the user that undo line.

Repair flags, each opt-in:

- `--close-turns` append the closers dsh's own crash-recovery rule produces.
  These are not invented by the tool.
- `--drop-unparsable` remove lines that will not parse.
- `--drop-duplicate-seq` remove later records claiming an already-used seq (the
  first is kept).
- `--truncate-at <line>` keep only records up to a line.

**The tool will not renumber seqs to close a gap, and neither should you.** Seq
is the durable pointer every compaction checkpoint uses; renumbering repoints
every existing marker at the wrong content. A `seq-gap` gets reported and left
alone. That is correct behaviour, not a missing feature.

## 7. Report

Write for someone who has to act. Structure:

1. **What is wrong** — one line per finding, worst first.
2. **Why** — the mechanism, from the `why` field. Not "it is broken".
3. **What is fine** — say what you checked and found healthy. A doctor that only
   lists faults leaves the user unsure what was even examined.
4. **What you did not check**, and why. If the tool would not run and you did a
   hand comparison, say so here.
5. **Proof** — the before/after checksums from `--prove-readonly`.

Do not propose a repair in the same breath as a diagnosis unless the user asked
for one. Diagnosis and repair are separate steps on purpose: the whole point is
that you can run this against a broken installation without making it worse.
