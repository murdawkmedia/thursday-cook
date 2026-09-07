# @trythursday/meridian-breaker

A dsh host-plane plugin that turns one recurring meridian failure into a
diagnosed, one-click recovery.

When meridian answers a model request with

```
HTTP 500 {"type":"error","error":{"type":"api_error",
          "message":"session transcript ownership backlog is full"}}
```

this plugin pauses **every** session in the process behind a single latch,
raises **one** dialog, and — if the user agrees — stops the meridian service,
deletes its two session-cache files, starts it again, and resumes every paused
chain on its original failover rung.

It matters for onboarding rather than repair: meridian is how someone with a
Claude subscription runs Thursday with no key and no signup, so it is a
provider Thursday recommends, and this is a failure those users cannot
diagnose themselves.

## Why the trigger is so narrow

It fires only when all three hold: status is 500, the body **parses** as JSON
with `error.type === "api_error"`, and `error.message` is exactly the backlog
string. Any other 500, any other `api_error`, and any body that fails to parse
fall through to the normal failover path untouched.

A breaker that trips on the wrong error is worse than none: it turns every
unrelated provider blip into a modal about a cache file. In particular the
trigger does **not** key on `failure.code`, which is `"SERVER"` for this fault
and for every unrelated meridian 5xx alike.

`tests/fixtures/meridian-backlog-500.jsonl` holds two records copied verbatim
from a session in which the fault really happened, and the suite asserts the
failure the rest of the tests are built from equals those bytes exactly.

## Running the tests

```sh
pnpm --filter @trythursday/meridian-breaker test
pnpm --filter @trythursday/meridian-breaker typecheck
```

Both first run `scripts/link-dsh-packages.mjs`.

## The dsh dependency convention this package sets

This is the first Thursday package to compile against `@deepseek-ai/*`, so it
sets a convention the next host plugin will copy. Read
`scripts/link-dsh-packages.mjs` for the full reasoning; in short:

**There is no registry dependency on `@deepseek-ai/*`, deliberately.**
`packages/build/src/spec.ts:19` declares `HOST_EXTERNAL = ["@deepseek-ai/*",
"node:*"]`, so a host plugin ships with those specifiers left external and the
dsh loader resolves them from the host at run time. The product never bundles
schemastery. Declaring a registry version would therefore add a lockfile entry
for something that is never shipped, **and** create a second copy that can
drift from the one the runtime loads — a suite green against the wrong oracle.

Instead the hook resolves the dsh installation the way
`packages/session/src/runtime.mjs:75` does — `$THURSDAY_DSH_PACKAGE`, else the
`dsh` on `PATH`, because that is the dsh that actually runs — and links its own
copies into this package's gitignored `node_modules`. `tsc`, `vitest` and
`node` then share one ordinary resolution path, and there is no version to keep
in step because there is only one copy.

### Consequence for CI, on the record

**A machine with no dsh installation cannot run this package's tests or
typecheck.** They fail loudly at the hook; there is no skip-when-missing mode,
because a suite that silently does not run is indistinguishable from one that
passed. A CI job must either install dsh (recommended), set
`$THURSDAY_DSH_PACKAGE`, or exclude this package explicitly and say so.

## Safety

Every service and filesystem effect goes through an injected port
(`ServiceControl`, `FileOps` in `src/remedy.ts`). `src/systemd.ts` holds the
only live implementations and no test executes it, so the suite never stops,
starts or reconfigures the real meridian service and never deletes the real
cache files. The unit name is resolved, never assumed: if it cannot be found,
the plugin says so and names the two paths to delete by hand rather than
claiming a repair it did not perform.
