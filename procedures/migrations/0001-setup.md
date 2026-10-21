---
thursday-note: setup migration 0001
thursday-revisit: 2026-11-11
---

# 0001 · first install

Idempotent, and platform-agnostic. Running it twice is not an error.

## Resolve

Do this before touching the filesystem. Store the results; never hardcode.

**Config**

| platform | path |
| --- | --- |
| linux | `${XDG_CONFIG_HOME:-~/.config}/thursday/thursday.toml` |
| darwin | `${XDG_CONFIG_HOME:-~/Library/Application Support}/thursday/thursday.toml` |
| win32 | `%APPDATA%\thursday\thursday.toml` |

**State** (sidecar, locks, caches)

| platform | path |
| --- | --- |
| linux | `${XDG_STATE_HOME:-~/.local/state}/thursday` |
| darwin | `~/Library/Application Support/thursday/state` |
| win32 | `%LOCALAPPDATA%\thursday` |

**Temp scratch**

| platform | path |
| --- | --- |
| linux / darwin | `/tmp/th-scratch` |
| win32 | `%TEMP%\th-scratch` |

Honor `XDG_CONFIG_HOME` and `XDG_STATE_HOME` on any platform if set.

## Steps

1. Resolve the paths above. Detect the harness and the shell.
2. If the config exists and `install.version` is current, stop and report — this
   is not a reinstall.
3. Greet. One line about what Thursday is for.
4. Ask where personal state lives, offering the platform default first:
   - linux · `~/th`, `~/Documents/Thursday`
   - darwin · `~/Documents/Thursday`, `~/th`
   - win32 · `%USERPROFILE%\th`, `Documents\Thursday`
5. Create:
   - `<personal>/`
   - `<personal>/scratch/`
   - `<personal>/procedures/`
6. Copy the shipped `procedures/*.md` into `<personal>/procedures/`.
   Never overwrite a file whose name starts with `user-yyy-`.
7. Write the config:

```toml
[install]
repo = "<repo path>"
version = "0.1.0"
harness = "<harness name>"
platform = "<linux|darwin|win32>"

[personal]
dir = "<personal>"
procedures = "<personal>/procedures"
scratch = "<personal>/scratch"
scope = "global"

[paths]
state = "<state>"
temp = "<temp scratch>"

[learned]
spiel = false
```

8. Copy the root skill into the harness's skill directory for this platform.
9. Generate one skill per verb from the root skill's verb table.
   - the skill name is the verb without its slash · `/thlog` → `thlog`
   - a verb that names a procedure points at it; a protocol verb carries its one
     line inline and says there is no procedure
   - a procedure with no verb gets no skill. It is still reachable from the root
     skill's procedure list
   - skip `template.md`
   - skip `user-yyy-*` that duplicates a shipped number
10. Verify. Every skill that points at a procedure resolves to a file that
    exists. Report dangling skills instead of shipping them.
11. Tell the user how to make the shell tool always-ask, for their shell.
12. Recommend `/thlearn 5`.

## Undo

Name the delete for every path this migration created, using native separators.

- `<personal>/`
- the config dir
- the state dir
- the generated verb skill directories
- the root skill directory

Nothing else was modified. If a global ignore entry was added, name it here.
