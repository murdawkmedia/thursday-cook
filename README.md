# Thursday Cook

A lean, experiment-led workflow for coding agents: agree on the task once, make
one useful change, verify the actual result, and report it in concise bullets.

This is an open fork of [Thursday](https://github.com/trythursday/thursday).
It adds the portable [thursday-cook skill](.agents/skills/thursday-cook/SKILL.md)
and an optional local measurement CLI. Thursday's core skills, tools and
procedures remain available; see [UPSTREAM.md](UPSTREAM.md). The website and
experiments now live in separate upstream repositories.

## Use the skill

Ask your agent to install **only .agents/skills/thursday-cook/** using its normal
skill installation process, preserving existing host and project instructions.
The folder is self-contained; it needs no model configuration, hook or runtime.
Then invoke it with:

> Use Thursday Cook for this task.

For measurement work:

> Use Thursday Cook with local measurements for this task.

If you want it as a default, configure your agent's project instructions to use
Thursday Cook for substantive tasks and answer quick questions directly.
Existing authorization carries forward within its scope. The skill asks about
unresolved choices that materially affect correctness or an external action.
Specialist workflows remain available when the task needs them.

Cook remains opt-in unless you configure it as your default. The original Thursday
skill now stays inert until invoked, offers task-first optional learning and
provides user-selected behavior zones. Cook keeps its own concise format and
existing scoped authorization; neither skill grants new permission.

The original Thursday setup installs its broader framework. Cook's standalone
installation is the selected folder above; using Cook requires no full setup.

## Measure carefully

The optional CLI emits a synthetic template or validates one supplied fixed
JSON record. Unknown observations remain null; observed zeros remain zero.
Verification boundary and actual-consumer evidence are separate fields.

```sh
bun run scripts/feedback-record.ts --template
bun run scripts/feedback-record.ts --validate < reviewed-record.json
bun test scripts
```

Validation is bounded and rejects unknown/duplicate fields without echoing values.
The helper does not collect sessions, store records or upload anything. Bun may
use its own runtime cache; see the [measurement guide](.agents/skills/thursday-cook/references/measurements.md).
Central stores should contain measurements and minimal metadata only; project
logs, notes and source stay with their projects. No measured time/token saving
is claimed. Comparisons require matched observation methods and tasks.

## Develop in the open

Run bun test scripts before proposing a change. Use synthetic fixtures and
keep local paths, private project context and real measurements out of PRs.
Contribute broadly useful fixes upstream where they fit; Cook-specific workflow
choices belong in this fork. The local-record tool is also proposed in
[upstream PR11](https://github.com/trythursday/thursday/pull/11), currently under review.

Reviewed upstream base: 1c77b3b (repository split after v0.2.0). The shipped setup, resolver and
skill generator now support Node24+ as well as Bun. The optional Cook measurement
CLI still uses Bun. Procedure refresh uses recorded hashes and preserves edited
or unrecorded copies. No full Thursday setup is needed for standalone Cook.

Run `bun test scripts` with both runtimes on PATH to exercise both. PowerShell
bootstrap tests run when `pwsh` is available; they mock downloading and do not
validate a real Windows install. Contributions and review are welcome.

## Upstream repository boundaries

- [Thursday core](https://github.com/trythursday/thursday): skills, procedures and tools.
- [Website](https://github.com/trythursday/site): landing page, blog and deployment.
- [Next Steps](https://github.com/trythursday/next-steps): the goal-planning experiment.
- [Idea Expander](https://github.com/trythursday/idea-expander): idea expansion and Thing Refiner image.

The fork follows the core split and retains its Git history. It does not deploy
or mirror the extracted applications. Logs use the user's existing system;
`tree-render.ts` requires an explicit Markdown input path.

## Attribution and license

Thursday is by Siddharth Singh and the Thursday contributors. Cook also adapts
selected Ponytail and pstack principles; complete notices are in the skill's
[NOTICE.md](.agents/skills/thursday-cook/NOTICE.md). This fork retains the upstream
[MIT license](LICENSE.md).
