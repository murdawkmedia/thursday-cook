# AGENTS.md — Thursday home rules

* The harness states the current file policy in its runtime context. Escalate
  one mode UP, never to the mode you already hold. If the policy is
  `workspace-write` and a file operation is denied, the only wider mode is
  `danger-full-access`; asking for `workspace-write` again always fails with
  "not strictly wider" and wastes the turn. Read the stated mode before you set
  `sandbox_permissions`.
* A raw `EROFS`, `read-only file system`, `EACCES`, or `Permission denied` on a
  path outside the workspace is the sandbox, not a broken machine. Common
  cases: `/run/user/<uid>` (podman, systemd, PID files), `~/.npm/_cacache`, a
  shared pnpm store, `~/.local/share`. These errors carry no
  `[sandbox: ...]` marker, so read the path first. If it sits outside the
  workspace, retry the exact same command once with
  `sandbox_permissions: danger-full-access` and a one-sentence justification.
  Do not invent a workaround and do not report the environment as broken until
  that retry also fails.
* NEVER EVER instruct subagents to return entire file contents. If you need to
  read a file, read it yourself. Subagents are for work that can be
  compartmentalized and whose indirect result is all you need: self-contained
  patches, code reviews, exploration, the like. "Return all file contents
  verbatim" is a directive that fails, and the puppy shoots back.
* If the user is vague about a request, ask questions until every ambiguity is
  resolved before you begin the implementation. A good plan is worth its
  weight in gold.
* Plan the change in full before you dispatch a subagent. You own the design.
  The subagent implements only. A subagent that designs the change or
  discovers scope by reading files loops and burns its own context and tokens.
* Keep each dispatch small. A small, well-bounded unit means a failed dispatch
  wastes little time and few tokens. Split large work into several small
  dispatches.
* Resolve every planning ambiguity before you dispatch. Subagents cannot ask
  the user. Settle the contract, then dispatch.
* Full up-front design keeps the code style consistent and makes review simple.
* When reviewing, assume the persona of a senior reviewer. Be especially wary
  of common AI slop patterns: dead code, unused imports, code duplicated
  between files, code almost the same but with a few parameters tweaked,
  duplicated type definitions. Also check for wheel reinvention — hand-rolled
  code that duplicates something an existing dependency already provides, or
  that a small, well-scoped new dependency would replace with meaningfully
  less bug surface (parsing, crypto, date/time, codecs and the like). Suggest
  adding one when that is a clear net win, not just to flag unused existing
  ones.
* When asked to commit files, group related changes together, but do not go
  down a git partial-staging rabbit hole — this is best-effort. If a file's
  changes are 25% change A (a global refactor) and 75% change B (a smaller
  specific fix), prefer grouping it with change B; some cross-contamination is
  fine. NEVER commit changes without asking first.
* Do not let PLAN.md updates become their own `Plan: ...` commits. When PLAN.md
  changes describe a code change you are committing, fold both into one
  commit. Commit PLAN.md on its own only when no code change exists yet to
  pair it with.
* If the user makes a request in between tool calls you have made, add the task
  to the todo list (todo_write) before continuing with your current task,
  unless you were told to do the new task first.
* NEVER EVER install dependencies by hand-editing Cargo.toml / package.json /
  any other package-manager manifest. ALWAYS use the command
  (`cargo add`, `pnpm add`, `npm add`, and friends) instead.
* When writing CSS, unless the project already uses them, NEVER use camelCase
  class or id names. kebab-case only.
* If a linter such as `cargo clippy` or `pnpm lint` is available and you are
  doing long-running or complex work, run it. Do not treat a successful build
  as proof that you are done. This matters most for TypeScript.
* If the user asks for a change or a review and you find pre-existing issues,
  ALWAYS surface them. Do not fix them without asking. Do not dismiss them as
  pre-existing either — often they are not pre-existing and you are just
  hallucinating.
* Do not use `find /` or other long-running, inefficient commands to locate
  files while gathering context. If you cannot find something, ask.
* Never mark a ticket or task done on a subagent's self-report alone.
  Independently verify at least one concrete, checkable claim against the real
  artifact yourself first. A dispatched review pass is a code-quality check,
  not a substitute. Then ask the user to do their own hands-on check before
  treating the work as truly done — especially anything with a UI or runtime
  surface, where a passing build is not evidence the feature works.
* Before you accept any claim in a diff, a linked issue, or a commit message as
  true — your own or a subagent's — verify it. An existence check ("does X
  exist in the codebase") is not a verification. State what observable
  behavior a revert would change, cite the evidence line for every factual
  claim, and confirm every new test can actually fail.
* Before you commit any change a subagent wrote, read the diff yourself
  (`git diff` / `git diff --staged`). Do this every time, not only for
  high-risk changes, and after any dispatched review pass. Do your own read
  right before you run `git commit`. This step reads real file content in the
  main session, so it has a real context cost; once it is done, tell the user
  to compact (or start a fresh session) before continuing.
* All of the above is a floor, not a ritual to maximize. Scale rigor to the
  ticket's actual risk and size, and stop once the stated bar is met. A pure
  CSS tweak or a doc fix does not need a dispatched review pass or repeated
  re-verification. A change touching money, crypto, or signing, public API
  surface, or spec conformance does. "Verify at least one concrete claim"
  means stop once that one check passes — re-running the same suite several
  times, re-reading files you already read, or dispatching a second review
  pass because the first found nothing is wasted turns and tokens, not extra
  safety.

## Batched changes: use `run_code` when the work is mechanical

Reach for `run_code` when a change is LARGE and BATCHED — a rename across many
files, a mechanical edit repeated over a directory, a bulk data
transformation — rather than issuing one tool call per file. The evidence is
concrete from this project: a lowercase rename across four files was one
`node -e` invocation, while populating dependency edges was forty-eight
separate tool calls for less certain results.

THE COUNTER-RULE, which matters just as much: a single targeted edit, or any
change where you must read and judge each site individually, stays a normal
edit call. `run_code` trades reviewability for throughput, and a blind bulk
regex over source is how subtle corruption enters — in this very project a
blind lowercase pass rewrote the environment variable name `AIDOS_PLUGIN_SPEC`
into a spelling that does not exist. If you would have to open the file to
know whether the pattern should match, it is not mechanical; do it with edit
calls.

(`run_code` is provided by Code Mode. It is available only when the Thursday
preset mounts it; if this section is present but the tool is not in your tool
list, Code Mode is not mounted in this preset and the rule does not apply.)
