# experiments/

Measurements taken before building something, so the decision has numbers under
it. Each subdirectory holds the script that produced the numbers and what they
said. Nothing here ships; nothing here is imported by the product.

An experiment stays even when its answer is no. The value of a measurement that
argued against building something is that nobody has to take it again.

---

# ast-editing

**Question.** Would structural (AST) editing be a material win over
`str_replace`-style text editing, and if so, how do you get a model to reach for
it without losing text editing for the cases AST cannot serve?

**Prompted by** https://github.com/hy-sde/dsh-tool-ast — `ast_grep` and
`ast_edit`, a packaged ast-grep behind the harness tool contract. Its own README
frames the two as complementary rather than alternatives: `ast_edit` for
codemods, `edit` for follow-ups.

## Method

`measure-edit-clusters.py` reads real session logs from `~/.dsh/sessions` and
counts. Run it:

    python3 experiments/ast-editing/measure-edit-clusters.py [N]

with `N` = how many of the newest logs to scan (omit for all).

**The unit is a cluster, not a call.** Counting `edit` calls answers the wrong
question. `ast_edit` is a codemod tool: one structural pattern rewritten across
every matching node. What it replaces is not "an edit" but a BURST of hand-written
edits making the same change in many places. So the script groups edits that are
close in time and asks whether they share a token — a cluster of six edits all
containing the same identifier is a rename done by hand, six times, and that is
one `ast_edit`.

## Two measurement bugs, recorded because both inverted a result

1. **`tool-call-chunks` also matches a naive `"tool" in type and "call" in type`
   filter.** Those are streaming partials carrying truncated JSON arguments.
   They inflated the edit count from 2,082 to 7,548 and produced 5,469 edits
   with an unparseable file path. Match `type == "tool/call"` exactly.

2. **Shell-based bulk edits are invisible to an edit-tool counter.** A model
   that gives up on `edit` writes a python heredoc or `sed -i` and rewrites many
   sites at once. That IS the codemod case. Missing it understated the
   addressable workload by about a third.

Result shape also matters: failures live at
`data.message.content[].isError`, linked back by `toolCallId`, not at the top
level.

## What the numbers said

150 sessions, gap threshold 180s:

| | |
|---|---|
| `edit` calls | 2,082 |
| edit failures | **359 — 17.2%** |
| of those: stale anchor | 264 |
| of those: must-read-first | 76 |
| of those: pattern not found | 19 |
| bash bulk edits (interpreter + in-place write) | **893** |
| of those, substitutions | 850 |
| of those, multi-file | 863 |
| `replace_all: true` | 2 |
| clusters of 2+ edits | 407 |
| clusters sharing a token | 174 |
| token-sharing clusters in code files | 135 |
| clusters spanning several files | 216 |

Edits by extension: `ts` 546, `md` 515, `tsx` 315, `sh` 228, `css` 124,
`mjs` 123, `js` 64, `json` 58.

## Reading

**About 30% of editing already happens through the shell**, as python heredocs
and `sed -i`, overwhelmingly multi-file substitution. That is the codemod
workload being done by hand today, and it is invisible to any analysis that
counts edit-tool calls.

**A sixth of text edits fail**, and the dominant failure is the stale anchor:
the file changed since the anchor was read. A structural match has no anchor to
go stale.

**`replace_all` is used twice in 2,082 edits.** The multi-site intent is real
but it is not expressed through the flag that exists for it — it goes to the
shell instead.

**The ceiling is set by file types.** ast-grep parses languages. `md` alone is
515 of 2,082 edits, against `ts` + `tsx` at 861. Markdown, YAML and JSON edits
cannot move to structural editing at all, so text editing does not go away and
should not be framed as a fallback for failure — it is the correct tool for
most of what gets edited.

## The open design question

How do you get a model to reach for `ast_edit` on a multi-site change while
keeping `edit` for one-offs and unparseable files? Guidance that says "prefer
ast_edit" produces the opposite failure: structural edits attempted on markdown.
The signal worth encoding is the one measured here — *the same change in several
places* — not a preference between tools.
