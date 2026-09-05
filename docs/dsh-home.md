# The Thursday DSH home

C1. Where Thursday's files live, who owns each one, and how a Thursday session
finds them. This document is the gate for A6, B1, C2, C3, C5, C6, I10 and I7:
each of those builds against the paths fixed here.

The central requirement, stated once and load-bearing everywhere below:

> **Thursday must not read or write anything inside the user's own dsh
> installation** — not `~/.dsh`, and not the dsh package tree. Today's
> `sync.sh` fails this by design: three of its twenty steps edit the shipped
> `standard` agent preset in place, and two more edit installed packages'
> own files inside `node_modules` (`dsh-web-app`'s `cordis.patch.yml` and
> `dsh-paste-to-path`'s `client.js`). Everything in this layout exists to
> make those five edits unnecessary or Thursday-internal rather than edits
> to the user's tree.

E6 proves it by checksumming the user's dsh home, the dsh package tree and the
shell profile files before install and after uninstall, and requiring byte
equality. This document is what makes that check passable.

## The layout

```text
~/.thursday/                                THURSDAY_HOME  (0700)
├── app/                                    the Thursday distribution
│   ├── package.json                        pnpm workspace root
│   ├── packages/                           cli, install, blocks, plugins, build, tokens
│   ├── profiles/thursday/ profiles/quick/  preset sources
│   ├── config/                             AGENTS.md, settings template, guards
│   ├── skills/                             Thursday's skill sources
│   └── node_modules/                       build/run deps of the engine itself
│
├── runtime/                                Thursday's own pinned dsh (I10)
│   ├── package.json                        the single place the dsh pin lives
│   └── node_modules/
│       ├── .bin/dsh                        the binary the launcher execs
│       └── @deepseek-ai/dsh/               package tree, incl. config/agent-presets/
│
├── dsh/                                    DSH_HOME  <- every dsh-owned path
│   ├── settings.yaml                       C5
│   ├── AGENTS.md                           C5
│   ├── mcp-servers.json                    the MCP roster
│   ├── cordis.patch.yml                    RESERVED FOR THE USER — never written
│   ├── .agent-presets/
│   │   ├── thursday/                       C2: agent.cordis.yml, preset.yml, shims
│   │   └── quick/                          C3
│   ├── skills/                             Thursday skills + aidos skills
│   ├── plugins/
│   │   ├── host/*.js                       built host-plane plugin bundles
│   │   └── guards/*.json                   bash-guard rule drop-ins
│   ├── profiles/web/
│   │   ├── cordis.patch.yml                C4: the generated host-plane composition
│   │   ├── pnpm-workspace.yaml             allowBuilds entries
│   │   ├── package.json                    the plugin dependency set
│   │   ├── cordis.yml                      dsh rewrites this on every boot
│   │   └── node_modules/                   third-party plugins, aidos, the forks
│   ├── sessions/                           dsh: session logs — the board's substrate
│   ├── storages/  attachments/  auth/  .credentials.yaml
│   └── aidos/scratch/<workspaceKey>/       the aidos durable scratch root
│
├── state/                                  Thursday's own bookkeeping
│   ├── install.json                        version, block set, dsh pin, outside-list
│   └── launch.json                         launcher -> session handoff (C6)
│
└── cache/
    ├── pnpm-store/                         pnpm content-addressable store
    └── tmp/                                clone/scratch space for install steps
```

Four owners appear in this document and they mean different things:

| Owner | Meaning | Fate at uninstall |
| --- | --- | --- |
| **Thursday** | written by the install engine from a block | deleted |
| **dsh** | written by the dsh runtime at session time, inside `DSH_HOME` | deleted with the home |
| **user (in home)** | the user's own file inside the Thursday home | named, and the user is asked |
| **user (outside)** | the user's, always | never touched |

---

## Q1. Where `THURSDAY_HOME` lives

**Decision: a single directory, `~/.thursday`, overridable by the
`THURSDAY_HOME` environment variable. Not XDG.**

Resolution order, and there are only two rules:

1. `$THURSDAY_HOME` if set and non-empty, expanded for a leading `~`, resolved
   to an absolute path.
2. otherwise `$HOME/.thursday`.

`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `$XDG_STATE_HOME` and `$XDG_CACHE_HOME`
are deliberately **not** consulted.

### Why not XDG

The home holds all four XDG categories at once: configuration
(`settings.yaml`, the presets), state (`sessions/`, the aidos scratch),
data (skills, guards, the plugin tree) and cache (the pnpm store,
`node_modules`). Honouring XDG properly means splitting it across four roots.

That directly destroys the v0.1.0 reversal thesis. I1 and I7 defer the install
ledger precisely because *reversal is structural*: uninstall is "delete the
home, plus a short enumerable list". A four-root split turns that into four
deletions with four chances to leave something behind, and makes the E6 tree
diff a four-way comparison — all to satisfy a specification that dsh itself
does not follow. `dsh` uses `~/.dsh`. `~/.thursday` sits beside it, is
discoverable by a user who already knows where dsh keeps its state, and is one
`rm -rf` from gone.

The counter-argument is real and is recorded rather than dismissed: a user with
a tidy `$HOME` gets one more dotfile, and a user who backs up `~/.local/share`
but not dotfiles will not back Thursday up. Both are acceptable at v0.1.0. The
env override is the escape hatch, and a user who wants
`~/.local/share/thursday` gets it by setting `THURSDAY_HOME` once in the
launcher's own environment — which is a *user* edit to a *user* file, not
something Thursday writes.

PLAN.md's cross-platform table reads `~/.thursday (XDG)` for Linux. That
parenthetical is superseded here: the home is `~/.thursday`, plain.

### What the supported platforms imply

**Linux (the reference target).** As above. `$HOME` is trustworthy, the home is
created mode `0700` because `dsh/.credentials.yaml` and `dsh/auth/` hold
provider secrets, and every subdirectory inherits that.

**Docker (DM1–DM4, E8).** A single-directory home is what makes the container
work at all. Persistent mode mounts *one* named volume at `$THURSDAY_HOME`;
ephemeral mode mounts nothing and the home lives in the container's writable
layer. An XDG split would need four mounts to achieve the same thing, and
getting three of four right is a silent data-loss bug. E8 runs as a non-root
user whose UID matches the host, so `$HOME` inside the image is that user's
home and `~/.thursday` resolves normally; the image sets `THURSDAY_HOME`
explicitly anyway, because `$HOME` in a container is whatever the image author
left in `/etc/passwd`. DM3's "no credential in the container" requirement has
exactly one path to police as a result: `$THURSDAY_HOME/dsh`.

**WSL2 (pending V4's stance).** WSL is Linux and needs no special case, with
one hard rule: **the home must not resolve under `/mnt/`.** A DrvFs path is
case-insensitive, cannot represent Unix permissions faithfully (so `0700` on
the credential file is a lie), and has inotify semantics that break both
`node_modules` linking and dsh's file watchers. The launcher refuses to start
when the resolved home begins with `/mnt/`, naming the reason. This is a
detection-and-message obligation on V8, not a portability abstraction.

**macOS and Windows are out of scope here.** V3 and V8 own their homes.
Nothing above branches on platform, so those tickets extend the resolver
through the V1 port rather than editing this decision.

### Two guards on the resolved value

The installer refuses, before writing anything, when the resolved
`THURSDAY_HOME`:

- is, contains, or is contained by the user's own dsh home (computed as
  `$DSH_HOME` from the *pre-launch* environment, else `~/.dsh`). This is a
  cheap structural defence of the E6 guarantee: no path Thursday writes can
  land inside a tree it promises not to touch if the two trees cannot overlap.
- begins with `/mnt/` (the WSL rule above).

### The home is not relocatable after install

Absolute paths are baked into generated files: the composition patch names
`$DSH_HOME/plugins/host/*.js` and `$DSH_HOME/plugins/guards`, and the aidos
loader shim re-exports from an absolute path under
`$DSH_HOME/profiles/web/node_modules`. Moving the directory therefore requires
`thursday sync` (I5) to regenerate them. That is stated here so I5 knows it
owns the case, and so nobody assumes a relocatable home they did not build.

---

## Q2. How a Thursday session gets `DSH_HOME`

**Decision: `DSH_HOME` is an environment variable set unconditionally by the
`thursday` launcher, for the lifetime of that process only. Its value is always
`$THURSDAY_HOME/dsh`. Nothing else sets it, and no shell profile is edited.**

The evidence that this is the whole mechanism, from the installed dsh:

- `@deepseek-ai/dsh-home-paths` resolves the home from `env.DSH_HOME` on every
  call (`DSH_HOME_ENV = "DSH_HOME"`), falling back to `join(homedir(), ".dsh")`.
  `dshHomePath(...segments)` is what every consumer uses.
- The user preset root is `dshHomePath(".agent-presets")`
  (`@deepseek-ai/dsh-agent-presets`, `USER_PRESET_DIR`). **This is the single
  fact that makes the whole design work:** move `DSH_HOME` and Thursday's
  presets are discovered from Thursday's home, alongside — not instead of — the
  shipped preset root, which dsh always injects separately at
  `<dsh package>/config/agent-presets/` with `trust: "system"`.
- The home-level patch layer is `join(resolveDshHome(), "cordis.patch.yml")`,
  and dsh's own comment notes it is "resolved per call, not at module load:
  `$DSH_HOME` may be set by the test **or launcher** after import". The
  launcher path is anticipated by dsh itself.
- The profile tree lives at `$DSH_HOME/profiles/<name>`, so plugin installs
  land in the Thursday home automatically once the variable is set.
- Even the aidos fs-sandbox patch computes
  `process.env.DSH_HOME || homedir() + "/.dsh"`, so it follows the Thursday
  home with no change (see A6, below).

### Why an environment variable and not a config file

There is no config file that could hold it. Every dsh configuration file
*lives inside the home*, so a file-based answer is circular: dsh would have to
know where the home is in order to read the file that says where the home is.
A CLI flag does not exist (`dsh` has `--profile` and `--patch`, no `--home`).
Process environment is the mechanism dsh provides, and it is the right one:
it is scoped to the launched process, so it cannot leak into the user's other
shells the way an exported variable in `~/.bashrc` would.

### Why the launcher and not the shell profile

Exporting `DSH_HOME` from `~/.bashrc` — which is roughly what a `sync.sh` user
does today — would repoint **the user's own** `dsh` command at Thursday's home.
That is the exact failure this whole ticket exists to prevent, and it would
also fail E6, which checksums the shell profile files. **Thursday writes to no
shell rc file, ever.** If `~/.local/bin` is not on `$PATH`, the installer
*prints* the line to add and continues; it does not edit anything.

### What the launcher does

`~/.local/bin/thursday` is a small POSIX `sh` shim — the only executable
Thursday places outside the home — that:

1. resolves `THURSDAY_HOME` by the Q1 rules;
2. sets `DSH_HOME="$THURSDAY_HOME/dsh"` **unconditionally**, overwriting any
   inherited value (a user who exports `DSH_HOME` for their own dsh must not
   have it silently inherited here);
3. prepends `$THURSDAY_HOME/runtime/node_modules/.bin` to `PATH`, so `dsh`
   inside a Thursday session means Thursday's pinned dsh (Q5);
4. records the requested preset for `thursday quick` in
   `$THURSDAY_HOME/state/launch.json` and/or passes it through — the exact
   mechanism is C6's to choose; this layout guarantees it a writable,
   Thursday-owned place to put it;
5. `exec`s `$THURSDAY_HOME/runtime/node_modules/.bin/dsh --profile web …`.

The same three variables are what the install engine itself exports around
every `dsh plugin add` and every `pnpm` invocation. The engine must never
locate dsh with `command -v dsh` + `realpath`, as `sync.sh` does in five
places: that resolves to the *user's* install. It uses `$THURSDAY_HOME/runtime`
and nothing else. This is acceptance criterion 2 restated as an implementation
rule.

### Why `DSH_HOME` is a subdirectory, not `THURSDAY_HOME` itself

The alternative — `DSH_HOME == THURSDAY_HOME`, one directory — is simpler by
one path segment and was rejected for two reasons.

First, ownership legibility. dsh writes freely into its home at runtime:
`sessions/`, `storages/`, `attachments/`, `auth/`, `.credentials.yaml`,
`input-history.json`, `tmp-paste/`, and whatever a future dsh version adds. If
Thursday's own `state/` and `runtime/` sat in the same directory, "which of
these is ours" would be answered by a hardcoded list that a dsh upgrade can
invalidate. With the split, the answer is structural: everything under `dsh/`
is dsh's, everything beside it is Thursday's.

Second, I7's criterion that a user file inside the home is named rather than
silently deleted requires computing "unexpected path". That computation is
tractable against four known top-level directories and intractable against a
directory dsh is also writing into. The Thursday-owned top-level set is the
five from Q7: `app/`, `runtime/`, `dsh/`, `state/`, `cache/`.

The cost is one extra level in every path, and `$DSH_HOME` no longer being the
thing the user thinks of as "the Thursday home". Both are acceptable.

---

## Q3. Presets, skills, guards, the patch, settings, and the rules file

All six live inside `$DSH_HOME`, because all six are discovered by dsh relative
to `DSH_HOME` and for no other reason. The layout is not a preference; it is
dictated by where dsh looks.

| Artifact | Path | Owner | Why here |
| --- | --- | --- | --- |
| Thursday preset (C2) | `dsh/.agent-presets/thursday/` | Thursday | `dshHomePath(".agent-presets")` is the user preset root |
| Quick preset (C3) | `dsh/.agent-presets/quick/` | Thursday | same root; see below |
| aidos loader shim | `dsh/.agent-presets/thursday/aidos-loader.js` | Thursday | preset rows resolve bare specifiers against the harness, not the profile, so this shim re-exports from an absolute path |
| Skills | `dsh/skills/` | Thursday | home skill root; discovered live per session |
| Guard rules | `dsh/plugins/guards/*.json` | Thursday | bash-guard reads its rules directory **live at session time**, so they must be in the home and not in the package |
| Host plugin bundles | `dsh/plugins/host/*.js` | Thursday | the composition names them by absolute path |
| Composition patch (C4) | `dsh/profiles/web/cordis.patch.yml` | Thursday | the profile's own patch layer |
| allowBuilds | `dsh/profiles/web/pnpm-workspace.yaml` | Thursday | pnpm reads it from the profile root |
| Plugin dependency set | `dsh/profiles/web/package.json` + `node_modules/` | dsh (written via `dsh plugin add`) | the profile tree |
| Settings (C5) | `dsh/settings.yaml` | Thursday, with one user-owned key | see below |
| Agent rules (C5) | `dsh/AGENTS.md` | Thursday | home-level rules file |
| MCP roster | `dsh/mcp-servers.json` | Thursday | the `mcp-servers` plugin reads this exact path |
| **User overrides** | `dsh/cordis.patch.yml` | **user** | see below |

### Both presets in one home

`.agent-presets/` is a directory of directories: one subdirectory per preset,
each with an `agent.cordis.yml` and a `preset.yml`. Two presets in one home is
therefore the *normal* case, not a special one — `~/.dsh/.agent-presets/aidos`
already demonstrates it. Thursday and Quick are two peers there, both
discovered, both offered in the preset picker, ordered by their `preset.yml`
`order:` keys. `thursday quick` is a selection among presets that are always
both present; it is not a different installation.

C3's requirement that the two presets "share their rows from one source, with
no copied duplicate" is a *build-time* concern in `app/profiles/`, not a
layout concern: the installed artifacts are two fully-resolved YAML files,
because dsh's preset discovery has no include mechanism to rely on.

### The one file Thursday deliberately does not write

dsh applies a home-level patch layer, `$DSH_HOME/cordis.patch.yml`, *over*
every profile's own layer. Thursday generates its composition into
`profiles/web/cordis.patch.yml` and leaves the home-level file permanently
empty and unmanaged. That gives the user a place to override any Thursday row
— disable a plugin, change a config — that outranks Thursday's own layer and
that `thursday sync` will never overwrite. It is inside the home, so uninstall
still removes it; it is the user's, so `thursday status` reports drift found
there as *theirs* rather than as damage.

### `settings.yaml` and the byte-level care

C5 owns the content. Two constraints from `sync.sh` carry into this layout and
are recorded so they are not lost in translation:

- **No full YAML round-trip.** PyYAML/js-yaml at YAML 1.1 reads the
  `reasoningEfforts` key `off:` as the boolean `false`, which the `llm-pi-ai`
  schema then rejects, dropping every pi-ai provider. The file is regenerated
  from the template and patched line-wise, never parsed and re-emitted.
- **`profile.active` is user state inside a Thursday-owned file.** It is read
  before the rewrite and restored after. It is the only such key at v0.1.0.

### What replaces the four in-place edits

This is the heart of the ticket, so it is stated per edit:

| `sync.sh` did | Thursday does instead |
| --- | --- |
| pin `agentOptions` onto `tool-subagent` rows in the shipped `standard` preset | authors the same `agentOptions` block directly in `.agent-presets/thursday/agent.cordis.yml`. Thursday owns the preset, so there is nothing to patch. |
| append `tool-presentation` (Code Mode, `mode: both`) to `standard` | includes the row in Thursday's own preset. |
| set `disabled: true` on `tool-bash`, `tool-goal`, `tool-jobs` in `standard` | never writes those rows. A row that is absent needs no disabling. |
| set `disabled: true` on `ui-jobs` inside `@deepseek-ai/dsh-web-app/cordis.patch.yml` — **a file in the package tree, not a preset** | a top-level override row `- id: ui-jobs` / `disabled: true` in `profiles/web/cordis.patch.yml`. The profile layer composes *after* every bundle layer, which is exactly how `sync.sh`'s own `command-compact` row already re-enables something `dsh-web-app` disabled. |

The last row is the only one that was not obviously avoidable, and it is the
one that matters most: it is the single edit `sync.sh` made outside the preset
system, and the mechanism to avoid it already existed in the same file.
**C4 must prove it at mount time** rather than assume it — the failure mode if
the override does not apply is a double-registered jobs UI, which is visible
immediately.

Thursday's presets are also, as a consequence, immune to the tripwire problem
`sync.sh` returns to again and again wherever it patches an installed file:
"a dsh reinstall that re-extracts the preset would silently revert this; rerun
sync to restore". Nothing Thursday installs
lives in a tree that a dsh reinstall rewrites, so
`step_verify_preset_tool_disabled` has no successor. `thursday status` (I6)
reports drift, but drift is now a hand edit rather than an expected consequence
of an unrelated upgrade.

---

## Q4. Thursday's own state

Three distinct things, and conflating them is how the `sync.sh` model got
confusing.

### The aidos board data

**Path: `$DSH_HOME/sessions/` (the event log) — no separate board file.**

aidos folds board state from session events; the durable substrate is dsh's own
session persistence, which lives under `DSH_HOME`. Nothing extra is needed for
the board to move with the home — it moves because the sessions do.

The consequence must be said plainly, because it will surprise someone: **a
Thursday session and a plain `dsh` session opened on the same project directory
do not share a board.** Boards follow `DSH_HOME`, and the two homes are
different by construction. That is the price of the isolation guarantee, and it
is the right trade: the alternative is Thursday writing into `~/.dsh`.

### The aidos durable scratch root

**Path: `$DSH_HOME/aidos/scratch/<workspaceKey>/`, i.e.
`~/.thursday/dsh/aidos/scratch/<workspaceKey>/`.**

This is `dshHomePath("aidos", "scratch", workspaceKey)` from
`aidos/src/tools/scratch.ts`, unchanged. `workspaceKey` is
`workspaceKeyFromPath(cwd)`: the absolute workspace path with separators
mangled to `-` and unsafe characters escaped, e.g.
`--home-sid-repos-thursday--`. This is the property the brief names — aidos
keys a project by its absolute workspace path and writes into its own data
directory, **never into the project** — and it is what lets Thursday's board
data live entirely inside the Thursday home while operating on workspaces
anywhere on disk.

Two notes for other tickets:

- **E1** says the durable scratch defaults to `$THURSDAY_HOME/scratch`. Read
  that as shorthand: the real default is the `dshHomePath` expression above,
  which resolves inside the home. E1 must read the default from wherever A6
  records it, exactly as its own body instructs, rather than hardcoding either
  spelling.
- **A6** decides whether the fs-sandbox exemption is kept as a patch, relocated,
  or upstreamed. This layout changes A6's arithmetic in one important way and
  A6 should use it: the sandbox file to patch is
  `$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js`,
  **inside a tree Thursday owns**. Option one therefore no longer means
  "mutate the shared dsh tree for as long as Thursday is installed"; it means
  patching Thursday's private copy, which satisfies both E6's checksum *and*
  E6's stated meaning. The patch's own scratch-root computation already reads
  `process.env.DSH_HOME`, so it needs no modification to follow the Thursday
  home. The decision remains A6's.

Uninstall deletes this directory. It holds agent working files, not user files,
but `thursday uninstall` names it in its output rather than removing it
silently.

### The install record

**Path: `$THURSDAY_HOME/state/install.json`. Thursday-owned, outside
`DSH_HOME`.**

It is **not a ledger** — I3 is deferred to v0.2 and this document does not
pre-empt it. The distinction is exact:

- A *ledger* records every effect an install applied — each file written, each
  config key set, each command run — so uninstall can replay them backwards.
  That is I3, and it earns its place only when blocks write outside the home.
- The *install record* answers "what is installed" in one read: the Thursday
  version, the set of block ids and their versions, the pinned dsh version, and
  the resolved outside-the-home paths this install created (Q6). It records
  *decisions and identities*, not *effects*.

I6 (`thursday status`) reads it and then compares blocks against what is
actually in the home; I7 reads its outside-the-home list. Neither reads it to
decide what to delete inside the home, because inside the home the answer is
"all of it".

`state/launch.json` is the second file here: the launcher-to-session handoff C6
needs for `thursday quick`. The layout reserves the location; C6 chooses the
mechanism and the schema.

---

## Q5. Thursday's pinned dsh runtime

**Path: `$THURSDAY_HOME/runtime/`, a private pnpm install with
`@deepseek-ai/dsh` pinned to an exact version in `runtime/package.json`, which
is the one place the pin lives (I10).**

The launcher execs `runtime/node_modules/.bin/dsh` by absolute path and never
resolves `dsh` from `PATH`.

### Why install rather than adopt

I10 requires the alternative to be rejected in writing, so:

Adopting whatever `dsh` is on the user's `PATH` would be less code and one
fewer copy of a large dependency tree. It fails for four reasons, in descending
severity.

1. **It makes E6 untestable.** E6 checksums the dsh package tree before and
   after. If Thursday runs from that tree, then any patch Thursday needs — A6's
   sandbox exemption being the live example — mutates the very tree Thursday
   promises not to touch, and the check either fails or is weakened into
   meaninglessness.
2. **The shipped preset root travels with the binary.** dsh computes it as
   `new URL("../config/agent-presets/", import.meta.url)` from its own `lib/`,
   and injects it with `trust: "system"`. Owning the runtime means owning that
   root, which is what turns "patch the shipped `standard` preset" into "ship
   our own preset beside a shipped one we never touch".
3. **Version skew is silent.** Every composition row and every override in this
   plan is written against a specific dsh: the `command-compact` re-enable, the
   `llm-pi-ai` disable, the `ui-jobs` override, the `applyEntryPatches`
   wholesale-assignment behaviour the `remote` row depends on. An unpinned
   runtime turns an upstream release into a breakage with no changed file to
   blame.
4. **The user's dsh may not exist.** I8 checks for node and pnpm only. On a
   clean machine there is nothing to adopt, and "install it globally if
   missing" is a global side effect on someone else's `PATH` — the thing this
   design refuses.

The cost is disk: a second full dsh tree, plus the profile's `node_modules`.
Accepted.

### The pnpm store

**Decision: `$THURSDAY_HOME/cache/pnpm-store/`, not the user's global store.**

pnpm defaults to a shared content-addressable store under
`~/.local/share/pnpm/store`. Writing into it would put Thursday content outside
the home, where uninstall must either leave it (a leak) or prune it (damaging a
cache the user's other projects depend on). Neither is acceptable for a
one-line reversal story, so the install engine points `store-dir` at a path
inside the home for every `pnpm` and `dsh plugin add` invocation it makes. The
cost is duplicated packages on disk and a slower cold install; the benefit is
that the pnpm store leaves the reversal surface entirely. The exact plumbing
(`--config.store-dir`, a Thursday-owned `.npmrc`, or an env var) is I4's to
choose.

Likewise `cache/tmp/`: the aidos-skills clone and any other transient install
work happen there rather than in `/tmp`, so a failed install leaves its debris
inside the home.

---

## Q6. The reversal surface: what is outside the home

**This list is the entire reversal problem at v0.1.0.** Everything else
Thursday installs is inside `$THURSDAY_HOME`, and `thursday uninstall` is
"remove the home, then remove these". I7 must enumerate them **in code, in one
constant**, so that adding a fourth outside-the-home effect without adding its
removal fails a test.

| # | Path | Owner | Uninstall |
| --- | --- | --- | --- |
| 1 | `~/.local/bin/thursday` | Thursday | delete |
| 2 | `~/.local/share/applications/thursday.desktop` | Thursday | delete |
| 3 | `~/.local/share/icons/hicolor/<size>/apps/thursday.png` for each shipped raster size, plus `~/.local/share/icons/hicolor/scalable/apps/thursday.svg` | Thursday | delete every path in the set |

Three entries, exactly as the brief predicted. Two riders:

- **Entry 3 is a set, not a path.** Its members are derived from B2's export
  list. I7 must compute the removal set from the same single source the
  installer wrote from, or a new icon size ships without a matching removal.
- **Two effects here are commands, not files.** `update-desktop-database
  ~/.local/share/applications` and `gtk-update-icon-cache
  ~/.local/share/icons/hicolor` are run after install and must be run again
  after uninstall, or the launcher entry lingers in the menu with a broken
  icon. The caches they regenerate (`mimeinfo.cache`, `icon-theme.cache`) are
  **not** Thursday's files and must not be deleted — they are regenerated.

Things that might look like they belong on this list and do not:

- **`~/.local/bin` itself.** Thursday creates it if absent but never removes
  it: it is a standard user directory and may hold the user's own binaries.
- **The pnpm store.** Removed from the list by the Q5 store-dir decision. If I4
  reverses that decision, this list grows and I3's ledger argument gets
  stronger — say so rather than quietly leaking.
- **Shell profile files** (`~/.bashrc`, `~/.profile`, `~/.zshrc`, and friends).
  Thursday never writes them, so there is nothing to reverse. E6 checksums them
  to keep it that way.
- **Node, pnpm, git.** Prerequisites. I8 detects and instructs; it never
  installs them, so uninstall never removes them.
- **`~/.dsh` and the user's dsh package tree.** Never read, never written. This
  is the guarantee, not an exception to it.

The rule for future work, stated as a rule so it survives: **a block that
writes outside `$THURSDAY_HOME` must add its path to the enumerated constant in
the same change.** When that constant stops being short enough to read at a
glance, I3's ledger has earned its place and v0.2 should build it.

---

## Q7. What belongs to the user and survives

| Path | Owner | Why it survives |
| --- | --- | --- |
| The AI scratch directory (E2) — default `~/.ai-scratch` or `~/ai-scratch`, or whatever the user named | **user** | It is the user's desk, not Thursday's filing cabinet. E2 promises uninstall leaves it alone; I7 names it and says so in its output. |
| `trying-out-thursday/` inside it (E4) | **user**, once written | Seeded by Thursday into a directory the user owns. Deleting a directory the user may have been working in, because Thursday created it a week ago, is exactly the behaviour that makes uninstallers feared. It survives. |
| The user's own dsh home `~/.dsh`, in full | **user** | Never touched. |
| The user's dsh package tree | **user** | Never touched. Thursday runs `runtime/`. |
| Shell profile files | **user** | Never written. |
| `~/.local/bin` (the directory) | **user** | Only Thursday's one file inside it is removed. |
| `<workspace>/.dsh/` in any project the user opened — e.g. `pastes/` from `dsh-paste-to-path` | **user** | Session artifacts inside the user's own project. Thursday never enumerates or cleans other people's repositories. |
| Any file the user created **inside** `$THURSDAY_HOME` | **user (in home)** | Per I7: uninstall names unexpected paths and asks rather than deleting silently. The Q2 subdirectory split is what makes "unexpected" computable — the Thursday-owned top-level set is `app/`, `runtime/`, `dsh/`, `state/`, `cache/`, and anything else is the user's. |

The wizard (E1) should say once, plainly, that the Thursday home is Thursday's
and the AI scratch directory is theirs. One sentence at setup prevents the
entire class of "I kept my notes in there".

---

## Every `sync.sh` artifact, and where it lands

`sync.sh`'s `STEPS` table, walked in order. `$DSH_HOME` below always means
`$THURSDAY_HOME/dsh`.

| # | `sync.sh` step | Artifact | Thursday destination | Owner |
| --- | --- | --- | --- | --- |
| 1 | `step_install_deps` | repo dev deps (esbuild) | `$THURSDAY_HOME/app/node_modules/` | Thursday |
| 2 | `step_build_plugins` | 11 host bundles, 10 client packages | build output under `$THURSDAY_HOME/app/`, host bundles copied to `$DSH_HOME/plugins/host/*.js` | Thursday |
| 3 | `step_sync_skills` | `skills/` | `$DSH_HOME/skills/` | Thursday |
| 4 | `step_sync_agents_md` | `home/AGENTS.md` | `$DSH_HOME/AGENTS.md` | Thursday (C5) |
| 5 | `step_sync_guard_rules` | `guards/*.json` | `$DSH_HOME/plugins/guards/` | Thursday |
| 6 | `step_sync_mcp_config` | `mcp-servers.json` | `$DSH_HOME/mcp-servers.json` | Thursday |
| 7 | `step_write_web_patch` | the heredoc composition | `$DSH_HOME/profiles/web/cordis.patch.yml`, generated from blocks (C4) | Thursday |
| 8 | `step_allow_builds` | `allowBuilds` codeload URLs | `$DSH_HOME/profiles/web/pnpm-workspace.yaml` | Thursday |
| 9 | `step_install_plugins` | ~30 pinned specs + local packages | `$DSH_HOME/profiles/web/node_modules/` + `package.json`, installed by `runtime/`'s dsh with `DSH_HOME` set, store in `$THURSDAY_HOME/cache/pnpm-store` | dsh, on Thursday's behalf |
| 10 | `step_report_extra_plugins` | nothing written | becomes `thursday status` (I6) | — |
| 11 | `step_install_aidos` | the pinned `aidos` package | `$DSH_HOME/profiles/web/node_modules/aidos/` (E5) | dsh |
| 12 | `step_sync_aidos_skills` | aidos `skills/` at the pinned commit | copied from the pinned package's own install at `$DSH_HOME/profiles/web/node_modules/aidos/skills/` — the package ships its skills, so the pin stays the single source of identity and no separate clone exists to drift | Thursday |
| 13 | `step_patch_standard_preset_tool_subagent` | **edited the dsh package tree** | **eliminated** — `agentOptions` authored into `$DSH_HOME/.agent-presets/thursday/agent.cordis.yml` | Thursday |
| 14 | `step_patch_standard_preset_tool_presentation` | **edited the dsh package tree** | **eliminated** — `tool-presentation` row authored into Thursday's preset | Thursday |
| 15 | `step_disable_preset_builtin_tools` | **edited the dsh package tree** | **eliminated** — `tool-bash` and `tool-goal` are simply not rows in Thursday's presets | Thursday |
| 16 | `step_disable_replaced_jobs_rows` | **edited the dsh package tree**, incl. `dsh-web-app/cordis.patch.yml` | **eliminated** — `tool-jobs` absent from the preset; `ui-jobs` disabled by a top-level override row in `$DSH_HOME/profiles/web/cordis.patch.yml` | Thursday |
| 17 | `step_relocate_attach_button` | **edited an installed package's file in place** — a regex rewrite of `dsh-paste-to-path/client.js`, moving the attach button from the `conversation.input.left` slot to `conversation.input.right` | **relocated, not eliminated** — the button placement is a real UX requirement, so the edit survives, but it now lands inside `$THURSDAY_HOME`'s own profile tree. The paste-to-path block owns it: a pinned fork whose client half needs a local modification is a hazard the block must carry, and the block's prose says so. It is a fifth in-place package edit in `sync.sh`, and the reason this table is twenty rows, not nineteen. | Thursday |
| 18 | `step_register_aidos_preset` | `.agent-presets/aidos/` + `aidos-loader.js` + `preset.yml` | folded into `$DSH_HOME/.agent-presets/thursday/` (C2), with the loader shim beside it | Thursday |
| 19 | `step_verify_preset_tool_disabled` | the tripwire | **no successor needed** — nothing Thursday installs is in a tree a dsh reinstall rewrites; I6 reports hand-edit drift instead | — |
| 20 | `step_set_defaults` | `home/settings.yaml`, `profile.active` preserved | `$DSH_HOME/settings.yaml` (C5) | Thursday, except `profile.active` |

Artifacts `sync.sh` touches outside its step table:

| Artifact | Thursday destination | Owner |
| --- | --- | --- |
| the dsh runtime itself (assumed present) | `$THURSDAY_HOME/runtime/`, pinned (I10) | Thursday |
| aidos `patches/apply-dsh-patches.sh` (the fs-sandbox exemption) | applied to `$THURSDAY_HOME/runtime/node_modules/@deepseek-ai/dsh-sandbox/`, if A6 keeps it | Thursday |
| host plugin bundles referenced by absolute path *into the dotfiles checkout* | copied into `$DSH_HOME/plugins/host/`, so the home is self-contained and deleting the source checkout cannot break a session | Thursday |
| dsh runtime state: `sessions/`, `storages/`, `attachments/`, `auth/`, `.credentials.yaml`, `input-history.json`, `tmp-paste/` | `$DSH_HOME/…`, created by dsh at session time | dsh |
| aidos durable scratch | `$DSH_HOME/aidos/scratch/<workspaceKey>/` | Thursday |
| launcher, desktop entry, icons | outside the home — the reversal surface (Q6) | Thursday |
| the AI scratch directory and the tour workspace | outside the home — the user's (Q7) | user |

Twenty steps in. Four are eliminated by authoring files Thursday owns
instead of patching files it does not, and a fifth — the attach-button
rewrite — is relocated from the user's tree into Thursday's own profile
tree, where the paste-to-path block owns it explicitly. No step remains
that edits anything outside `$THURSDAY_HOME`.

---

## What this document does not decide

- **Build on the user's machine, or ship prebuilt bundles.** I4 and R2 own it.
  The layout is unaffected either way: build inputs and outputs both live under
  `$THURSDAY_HOME/app/`, and the installed artifact is
  `$DSH_HOME/plugins/host/*.js` in both cases.
- **How `thursday quick` names the preset to the session.** C6's. The layout
  reserves `$THURSDAY_HOME/state/launch.json` and guarantees it is writable and
  Thursday-owned.
- **Whether the `ui-jobs` top-level override row actually suppresses the row
  `dsh-web-app` inserts.** The mechanism is the same one `sync.sh` already uses
  for `command-compact`, and the layer order (bundle patches -> profile patch ->
  home patch -> overlays) says it should. It is asserted here as the design and
  must be **proven at mount by C4**. If it does not hold, the fallback is a
  patch to `$THURSDAY_HOME/runtime/`'s copy, which is still inside a tree
  Thursday owns and still satisfies E6 — so the guarantee does not depend on
  this being right, only the tidiness does.
- **The A6 fs-sandbox decision.** This document makes option one materially
  safer by giving Thursday its own runtime tree, and records that. It does not
  make the choice.
- **The exact icon size set.** B1 and B2 own it; Q6 records that the removal set
  must be derived from the same source the installer writes from.
- **The pnpm `store-dir` plumbing.** The policy (store inside the home) is
  decided; the flag is I4's.
- **macOS and Windows homes.** V3, V4 and V8, through the V1 port. Nothing here
  branches on platform, so extending is additive.
