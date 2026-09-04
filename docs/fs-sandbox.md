# The fs-sandbox scratch-root exemption

A6. Whether Thursday keeps patching dsh's fs sandbox to allow writes into the
aidos durable scratch root, moves that root somewhere the sandbox already
allows, or upstreams the exemption to dsh. This document is the gate for E5
(which ships the scratch tools), E6 (which promises the user's dsh is
untouched) and E1 (which must read the scratch default from here rather than
hardcoding it).

## The sentence

This is the wording every downstream guarantee, every uninstall message and the
website reuse **verbatim**:

> **Thursday does not modify the shared dsh package tree: the one file it
> patches, the fs sandbox's writable-root list, belongs to Thursday's own
> pinned dsh copy inside `$THURSDAY_HOME/runtime/`, so the user's own dsh
> installation stays byte-identical for the entire time Thursday is
> installed.**

Do not paraphrase it into "Thursday patches dsh" (true, but reads as the shared
tree) or into "Thursday patches nothing" (false). The distinction the sentence
carries — *whose copy* — is the whole decision.

---

## Decision

**Option 1, in its new form: keep the patch, applied by the install engine to
Thursday's private dsh runtime, reversed by deleting the home.**

Thursday owns the patch step rather than shelling out to aidos's
`patches/apply-dsh-patches.sh`, for three defects found in that script and
recorded below. The mechanism is otherwise identical: two exact-string
replacements in one file.

---

## What the problem actually is

aidos keys a project by its absolute workspace path and writes its durable
scratch into its own data directory, never into the project
(`aidos/README.md`, "Rules"). The root is
`dshHomePath("aidos", "scratch", workspaceKey)` — `aidos/src/tools/scratch.ts`
lines 37–38 — where `workspaceKey` is `workspaceKeyFromPath(cwd)`, the
`--`-wrapped canonical form from `aidos/src/kernel/slug.ts` line 50.

dsh's own harness policy allows scratch writes in every phase, and aidos's
write boundary exempts the root. The fs sandbox is the one layer that does not.
Its allow-list is a single function, `writableRoots(policy)`, in
`@deepseek-ai/dsh-sandbox/lib/index.js`, and unpatched it returns exactly three
roots: `policy.workspaceRoot`, `"/tmp"`, and `tmpdir()`. Anything else refuses
with `FS_SANDBOX_DENIED` (`@deepseek-ai/dsh-fs-sandbox/lib/index.js` line 168)
— including `scratch_edit`, which delegates to `edit` and therefore crosses the
fence.

Two facts about that function shape every option below.

**It is the single owner of the writable set.** `dsh-fs-sandbox` imports it
(line 164) and so does `dsh-sandbox-local`, which builds the bwrap, Landlock
and Seatbelt profiles from it (line 71). dsh's own README calls this out: "the
writable set comes from `writableRoots`, shared with the Seatbelt profile; a
runner profile that defines its writable set elsewhere would drift." One patch
site therefore covers the fs tools *and* the bash runner, with no second edit
and no parity risk.

**It has no configuration seam.** `SandboxExecutionPolicy`
(`dsh-sandbox/lib/types/index.d.ts` lines 27–40) carries `mode`,
`workspaceRoot` and `sessionId`. There is no field for extra writable roots, no
settings key that adds one, and no environment variable. There is no way to get
a fourth root into that list except by changing the code that builds it. That
kills every "just configure it" answer before the three options are even
compared.

---

## Why the arithmetic changed

The A6 ticket, and PLAN.md line 150, both assume the patch "lives in the dsh
package tree, not in the home", and reject option 1 on exactly that ground:
Thursday would "mutate the shared dsh tree for as long as it is installed".

That assumption is void as of C1. I10 gives Thursday its own pinned dsh inside
the Thursday home, and `docs/dsh-home.md` fixes it at `$THURSDAY_HOME/runtime/`
(Q5, and the layout tree at line 32: "`runtime/` — Thursday's own pinned dsh
(I10)"). The launcher execs `runtime/node_modules/.bin/dsh` by absolute path
and never resolves `dsh` from `PATH` (Q2, step 5). I10's own rejection of
adopting the user's dsh names this case first: "any patch Thursday needs — A6's
sandbox exemption being the live example — mutates the very tree Thursday
promises not to touch, and the check either fails or is weakened into
meaninglessness."

Verified against `docs/dsh-home.md` rather than taken on trust: Q4 states it
directly at lines 396–402 — the file to patch is inside "a tree Thursday owns",
so "Option one therefore no longer means 'mutate the shared dsh tree for as
long as Thursday is installed'; it means patching Thursday's private copy,
which satisfies both E6's checksum *and* E6's stated meaning." Line 597 of the
same document already routes the aidos patch to
`$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh-sandbox/`, conditional on
this ticket.

The objection that defeated option 1 was never about patching. It was about
*ownership*. Ownership changed; the objection went with it.

---

## The two losers

### Option 2 — move the scratch root somewhere the sandbox already allows

**Rejected: there is no such path that is both durable and outside the user's
project.**

The unpatched allow-list has three members and each fails a hard requirement:

- **`policy.workspaceRoot`.** This is the user's project directory. aidos's
  first rule is "aidos never writes a file into a project directory. All state
  lives in aidos's own data directory." `docs/dsh-home.md` Q7 additionally
  assigns `<workspace>/.dsh/` in any opened project to the **user**, and states
  that Thursday "never enumerates or cleans other people's repositories" — so
  Thursday could not even remove what it wrote. This option does not relocate
  the scratch root; it deletes the property that makes it safe.
- **`/tmp`.** Not durable. The scratch root is aidos's cross-session working
  memory for a workspace, keyed so that reopening the same project finds it
  again; a tmpfs that a reboot or `systemd-tmpfiles` clears is a different
  feature. It also lands agent working files outside `$THURSDAY_HOME`, adding a
  fourth entry to the Q6 reversal surface — the list `docs/dsh-home.md` calls
  "the entire reversal problem at v0.1.0" — for no gain.
- **`tmpdir()`.** The same objection as `/tmp`, plus it is per-platform, and E8
  runs a container where it is the writable layer.

There is a fourth variant worth naming so it is not re-proposed: make
`$THURSDAY_HOME` itself the workspace root. That is not a relocation of scratch,
it is a redefinition of what a Thursday session is working on, and it breaks
every other tool in the session.

This option also has a cost the others do not: it forks aidos. The path is
computed in `aidos/src/tools/scratch.ts` and asserted by
`aidos/tests/c5-workspace-key.test.ts`, which pins the `--...--` key shape in
seven cases. Changing it means carrying an aidos patch instead of a dsh patch —
strictly worse, because the aidos patch would be a behavioral fork of a package
Thursday installs from a pin (E5), while the dsh patch is two string
replacements Thursday can re-derive.

### Option 3 — upstream the exemption to dsh

**Rejected on schedule and on shape, not on merit.**

On shape: the patch as written hardcodes `"/aidos/scratch/"` and a
reimplementation of aidos's key mangling into a generic sandbox package. That is
not an upstreamable change — dsh would be encoding one plugin's private
directory layout into its security boundary. The upstreamable change is the
missing seam: an extra-writable-roots field on `SandboxExecutionPolicy`, or a
provider hook a plugin can contribute to. That is a real design proposal against
a security-relevant API, with an approval loop Thursday does not control and
cannot schedule.

On schedule: A6 gates v0.1 (the ticket says so, and `docs/release-scope.md`
line 48 puts A6 in the composition front). E5 ships the scratch tools and they
do not work without the exemption. A v0.1 that depends on an unmerged upstream
PR is a v0.1 that does not ship.

On top of both: even a merged upstream fix would not remove the need for this
document. Thursday pins dsh to an exact version in one place (I10). The fix
would land in some later dsh, Thursday would keep running the pinned one until
it bumps, and the interim answer would still be "patch the pinned copy". Option
3 is what Thursday does *next*, not instead.

**Recorded as follow-up, not as a decision:** propose the seam upstream. If it
lands, the patch step becomes a settings row and this document's option 1
section becomes history. Nothing else changes, because the scratch path itself
does not move.

---

## Does the patch follow `DSH_HOME` unmodified?

**Confirmed by reading the script, not assumed. Yes.**

`aidos/patches/apply-dsh-patches.sh` line 88, inside the replacement text it
injects:

```
	const home = process.env.DSH_HOME || homedir() + "/.dsh";
```

and the same line as it exists in the currently patched installation,
`@deepseek-ai/dsh-sandbox/lib/index.js` line 171:

```
	const home = process.env.DSH_HOME || homedir() + "/.dsh";
```

The launcher sets `DSH_HOME="$THURSDAY_HOME/dsh"` unconditionally for the
lifetime of the process (`docs/dsh-home.md` Q2), so inside a Thursday session
this expression resolves to `$THURSDAY_HOME/dsh` and the granted root is
`$THURSDAY_HOME/dsh/aidos/scratch/<workspaceKey>` — exactly where
`dshHomePath("aidos", "scratch", workspaceKey)` writes, because
`@deepseek-ai/dsh-home-paths` resolves the home from `env.DSH_HOME` on every
call. The patched code needs no Thursday-specific modification.

`docs/dsh-home.md` line 195 asserted this; it is now checked. The assertion was
correct.

### But the script has a bug that makes the patch inert

Reading it rather than assuming turned up something the assertion did not
cover. The path the script grants and the path aidos writes to are **not the
same directory**.

Script line 106, the last line of the injected function:

```
	return home + "/aidos/scratch/" + readable;
```

The installed, working copy, `dsh-sandbox/lib/index.js` line 189:

```
	return home + "/aidos/scratch/--" + readable + "--";
```

aidos's `workspaceKeyFromPath` (`slug.ts` line 50) returns `"--" + readable +
"--"`, and `tests/c5-workspace-key.test.ts` line 15 pins it:
`workspaceKeyFromPath("/home/sid/repos/aidos")` is `"--home-sid-repos-aidos--"`.

So the committed script grants
`$DSH_HOME/aidos/scratch/home-sid-repos-thursday` while aidos writes to
`$DSH_HOME/aidos/scratch/--home-sid-repos-thursday--`. Those are sibling
directories, not an ancestor and a descendant, so the containment check never
matches and `FS_SANDBOX_DENIED` survives the patch. The script is idempotent,
exits 0, prints "applied", and changes nothing that matters.

The installed file carries the `--` wrapper, so the working machine was
hand-corrected after the script ran (the sandbox file's mtime precedes the
script's by one minute, and `git status` reports the script clean against
`e078b54`, the only commit that touched it). The correction never made it back
into the script.

**Consequence for Thursday:** copying the script's replacement text verbatim
would ship an install that appears to succeed and does not work. Thursday's
patch step uses the *installed* form — the one with the `--` wrapper — and
carries a test that writes through `scratch_write` in a fresh install and
asserts the file lands, which is A6's first acceptance criterion anyway. This is
also worth an upstream aidos bug report.

### Two more defects Thursday must not inherit

- **Lines 24–26 default to the user's dsh.** With no argument the script
  resolves `command -v dsh` and `readlink -f` to find the package root. That is
  precisely the mechanism `docs/dsh-home.md` Q2 forbids — "The engine must never
  locate dsh with `command -v dsh` + `realpath`, as `sync.sh` does in five
  places: that resolves to the *user's* install" — and invoking the script with
  no argument on a machine that has its own dsh is a direct, silent violation of
  the sentence at the top of this document. Thursday always passes an explicit
  root and never relies on the default.
- **Lines 39–41 are a silent success.** When the sandbox file is not found under
  the given root, the script prints "nothing to patch" and `exit 0`. For aidos,
  on an unknown layout, that is defensible. For Thursday it is not: the file is
  at a path Thursday itself created from a pin it controls, so a miss means the
  runtime install is wrong and the install must fail. Thursday's step treats a
  missing target as a hard error.

---

## What Thursday actually applies

One file:

```
$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js
```

`docs/dsh-home.md` writes this as
`runtime/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js`; the real path
depends on how the runtime is installed. In the npm layout observed on the
development machine, `dsh-sandbox` is nested inside the `@deepseek-ai/dsh`
package's own `node_modules`, which is why aidos's script builds
`"$DSH_ROOT/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js"` from the *dsh
package root* and not from an install prefix. Under I10's pnpm install it may
instead be reached through `.pnpm/`. The install step therefore **resolves the
file rather than assuming a spelling**, and applies three guards before writing:

1. resolve the sandbox entry from the runtime tree, failing loudly if not found;
2. `realpath` it and refuse unless the result is under `$THURSDAY_HOME` — the
   structural defence of the sentence at the top of this document, and the same
   shape as the Q1 guard that refuses a home overlapping the user's dsh home;
3. break the link before writing (see the hardlink hazard below).

Two exact-string replacements, both of which must match or the step fails:

- the `node:os` import gains `homedir`;
- `writableRoots` gains a fourth entry,
  `scratchRootForWorkspace(policy.workspaceRoot)`, and that function is appended
  beside it.

The function's body is aidos's `workspaceKeyFromPath` transliterated to plain
JS, with the `--` wrapper, reading `process.env.DSH_HOME` as quoted above.

### The hardlink hazard, and why the store decision is load-bearing

pnpm materializes `node_modules` files as hardlinks into its content-addressable
store. Editing such a file in place edits every other link to the same content.
`docs/dsh-home.md` Q5 puts the store at `$THURSDAY_HOME/cache/pnpm-store/`, so
every link to the patched content is inside the Thursday home and the blast
radius is bounded by construction.

**This makes the Q5 store-dir decision a precondition of the guarantee, not a
tidiness preference.** If I4 ever points Thursday's installs at the user's
global pnpm store, an in-place patch would mutate content shared with the user's
own projects — outside the home, outside the uninstall surface, and outside the
sentence at the top of this document. Q6 already says "If I4 reverses that
decision, this list grows"; A6 adds that reversing it also breaks A6, and the
patch step must then be re-decided rather than merely re-pathed.

Regardless, the step breaks the link before writing (`cp --remove-destination`
or an equivalent unlink-then-write), so the patched file is private to the
runtime tree even if a future store lives elsewhere.

---

## How uninstall restores the file byte for byte

Three answers, in the order they apply.

**The user's dsh is restored by never having been opened.** The patched file is
not in the user's dsh package tree. Thursday's install engine never resolves
`dsh` from `PATH`, and the Q1 guard refuses to install when the resolved
`THURSDAY_HOME` is, contains, or is contained by the user's dsh home. E6's
checksum of the shared tree is byte-identical before install and after
uninstall because nothing in the install path can address it.

**Thursday's copy is restored by deletion.** The patched file lives only inside
`$THURSDAY_HOME/runtime/`, which `thursday uninstall` removes with the rest of
the home. There is no edit to revert: the file ceases to exist, together with
the pinned dsh it belongs to. The Q6 outside-the-home list — the launcher, the
desktop entry, the icons — gains no entry from this decision, which is the
strongest single statement available about the patch's reversal cost.

**Within an installed Thursday, the original bytes are kept anyway.** Before the
first write, the step copies the untouched file to
`$THURSDAY_HOME/state/dsh-sandbox.orig` alongside the dsh version it came from.
This is not needed for uninstall; it is needed for `thursday sync` (I5) and
`thursday status` (I6), so a re-patch starts from known bytes instead of
attempting to re-match text it may have already rewritten, and so drift is
reported as a diff against a stored original rather than as a guess. The sidecar
is a Thursday-owned file inside the home and is deleted with it.

The corresponding claim in E6's terms: after `thursday uninstall`, the user's
dsh home, the user's dsh package tree and the shell profile files hash to what
they hashed before install, and the only files this decision created are gone
with the home.

---

## What happens on a dsh version bump

**The patch fails loudly. Confirmed by reading the script.**

The mechanism is exact-string replacement guarded on both sides. The script's
own header states the intent at lines 13–15: "Every patch is an exact-string
replacement that refuses to run when the target text does not match, so an
upstream dsh change surfaces here as a loud failure, never a silent drift." The
code backs it:

```
20: set -euo pipefail
...
60:     sys.exit("import line does not match; upstream changed")
...
109:     sys.exit("writableRoots block does not match; upstream changed")
```

`sys.exit` with a string writes the message to stderr and exits 1; under
`set -e` the shell aborts non-zero. So if a future dsh reformats the import, or
adds a fourth root, or renames the function, the step stops with a message that
names which of the two anchors moved. The only silent paths are line 46's
`grep -q 'scratchRootForWorkspace'` idempotence check, which is correct — it
detects Thursday's own prior patch, not upstream drift — and lines 39–41's
`exit 0`, which Thursday replaces with a hard error as described above.

Because Thursday pins dsh to an exact version in one file (I10), the bump is
always a deliberate edit, and the patch failing is a build failure on that edit
rather than a surprise on a user's machine. The obligations that follow, stated
as rules so they survive:

- **A dsh bump is not merged until the patch step passes against the new
  version.** The step's failure message names the anchor; re-deriving it is
  reading one function in one file.
- **Passing the string match is not the test.** The acceptance test is a
  `scratch_write` in a fresh install, because the `--` bug above is proof that a
  patch can apply cleanly and grant the wrong directory.
- **If upstream restructures `writableRoots` beyond re-anchoring** — say it
  becomes a composed allow-list, or gains the policy field option 3 asks for —
  that is the signal to revisit this document rather than to widen the match.

The exposure is honestly small: two anchors, in one function, in a package whose
own README treats that function as the single owner of the writable set and
therefore has reason to keep it stable.

---

## What this document does not decide

- **The upstream proposal.** Named as follow-up above; not scheduled, and v0.1
  does not wait for it.
- **Where the patch step lives in the block set.** I2 and I4 own the block
  model; A6 requires only that it run after the runtime install (I10) and before
  the first session.
- **The exact spelling of the sandbox path under pnpm.** The step resolves it;
  I4 owns the install that determines the layout.
- **Reporting drift in `thursday status`.** I6 owns it. This document gives it
  the stored original to diff against.
- **The aidos bug report for the missing `--` wrapper.** Worth filing upstream
  in aidos; Thursday does not depend on it being fixed, because Thursday no
  longer runs that script.
