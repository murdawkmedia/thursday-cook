# packages/install

The install engine: block schema, planner, actions.

A **block** is one markdown file — YAML frontmatter for the data, prose for the
reasons, named actions for the steps. `docs/block-format.md` is the decision;
this package is the implementation of its schema half. Real blocks live in
`packages/blocks`; `examples/` here holds the ones the tests load.

## What is in here

| File                 | What it holds                                                        |
| -------------------- | -------------------------------------------------------------------- |
| `src/schema.ts`      | The frontmatter: every field, its doc comment, and its validator.    |
| `src/actions.ts`     | The action registry: install actions, detect actions, step checking. |
| `src/constraints.ts` | The constraint registry: named facts the installer must honour.      |
| `src/loader.ts`      | Parse a block file, validate it, surface its constraints.            |
| `src/errors.ts`      | `BlockError`, which names every bad field at once.                   |

```ts
import { loadBlockFile } from "@trythursday/install";

const block = loadBlockFile("packages/blocks/llm-pi-ai.md");
block.frontmatter.steps; // typed per action, defaults applied
block.constraints; // every constraint declared, with where and why
```

## The three rules the code enforces

**Steps are named actions.** A step names an action from the registry and
passes typed parameters. An unknown action fails at load with the step's index
and the list of known names. A block that needs new behaviour gets a new
action, not an escape hatch — `run` exists for a third-party installer with no
API, and it requires a `why` that review reads as a request for a new action.

**No logic in frontmatter.** No conditionals, no loops, no templating, no
expression language. The loader rejects control-flow keys (`if`, `when`, `for`,
`matrix`, …) anywhere in the frontmatter and rejects `{{ … }}` / `${ … }` in
any value. The "already installed?" branch every installer needs lives in
`detect`, which is a list of predicates the installer runs before `steps`.

**Constraints are data.** `sync.sh` knew things — that the compaction fork must
install under another package's name, that three rows must be top-level
overrides, that the settings file must never take a YAML round-trip — and it
knew them in comments, where nothing could read them. Here each is a named
entry in `src/constraints.ts` with its failure mode and the actions that honour
it, and a block declares it with a mandatory reason. Declaring a constraint on
an action that does not honour it is a load error, so the knowledge cannot rot
into decoration.

## Uninstall, and why `reverse` is empty

Everything Thursday installs lives inside a dedicated Thursday home, so
uninstall removes the home instead of replaying recorded effects backwards.
That is the stronger guarantee: a replay undoes what someone remembered to
record, and removing the home undoes everything. `reverse` is defined,
validated and unused, for the one case the home cannot cover — an effect
outside it, which a block must declare in `integrations` or in `sideEffects`
with `undoneByRemovingHome: false`.
