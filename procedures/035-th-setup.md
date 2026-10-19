---
thursday-note:
  desc: setup
  mechanical: true
thursday-revisit: 2026-11-11
---

Concept: Set Thursday up in one pass, on any platform, and name the delete for
everything it creates.

## Why?

Setup and teardown are symmetric. A user should be able to get rid of Thursday at
any point without hunting for what it left behind. Every install path names its
own undo.

Setup is also the only thing that writes `thursday.toml`. One writer, many
readers.

The same experience on Linux, macOS, and Windows. Nothing in the instructions
should assume one of them.

## Resolve paths first

Never hardcode a path. Resolve, then write the absolute result into the config.

**Config file**

- Linux · `${XDG_CONFIG_HOME:-~/.config}/thursday/thursday.toml`
- macOS · `${XDG_CONFIG_HOME:-~/Library/Application Support}/thursday/thursday.toml`
- Windows · `%APPDATA%\thursday\thursday.toml`

Honor `XDG_CONFIG_HOME` if set, on any platform. That is the escape hatch for
people who keep their dotfiles in one place.

**Personal dir defaults**

- Linux · `~/th`
- macOS · `~/Documents/Thursday`
- Windows · `%USERPROFILE%\th`

**State dir** (usage sidecar, locks, caches)

- Linux · `${XDG_STATE_HOME:-~/.local/state}/thursday/`
- macOS · `~/Library/Application Support/thursday/state/`
- Windows · `%LOCALAPPDATA%\thursday\`
- temp scratch · `<system temp>/th-scratch` — `/tmp/th-scratch` on Unix,
  `%TEMP%\th-scratch` on Windows

Resolve all of these through the platform's own conventions, then store absolute
paths in the toml. Do not store `~` or `%VAR%` — they do not expand consistently.

## General procedure

1. **Greet.** One line. Say what Thursday is for, in their terms, not ours.
2. **Detect the platform.** OS, shell, and harness. Ask only if detection is
   genuinely ambiguous.
3. **Read the config.** If it exists and is current, say so and stop — this is
   not a reinstall.
4. **Ask one question.** Where should personal Thursday state live? Offer the
   platform default first, the other common option second.
   - Linux · `~/th` or `~/Documents/Thursday`
   - macOS · `~/Documents/Thursday` or `~/th`
   - Windows · `%USERPROFILE%\th` or `Documents\Thursday`
   Do not ask anything else yet.
5. **Create the state.**
   - the personal dir, and `scratch/` inside it
   - `procedures/` inside it
   - copy the shipped procedures in; never overwrite `user-yyy-*`
6. **Write the config.** The single static path resolved above. Everything else
   resolves from it. See the shape below.
7. **Install the skill.** Copy the root skill to the harness's skill directory,
   then generate the `th-*` pointers from the procedures. See
   `040-th-harnesses.md` for where each harness keeps them, per platform.
8. **Turn off yolo mode.** One of the first things. Make the shell tool
   always-ask, and say the exact setting for their shell:
   - bash / zsh · the harness's confirmation setting, or a wrapper
   - fish · same, via `fish` config if the harness uses it
   - PowerShell · same, via the harness's setting
   - Windows native without a POSIX shell · the harness's command tool
   Taking back situational awareness is the point. They can re-enable
   auto-accept deliberately when they want a burst of autonomy.
9. **Verify.** Read the config back, list the generated pointers, and check that
   every pointer resolves to a procedure that exists, using forward slashes or
   native separators as the platform expects. If a procedure is missing, say so
   rather than shipping a dangling pointer.
10. **Recommend `/thlearn 5`.** One sentence. Do not explain the rest of the
    verbs.

## Config shape

```toml
# resolved per platform — see "Resolve paths first"
[install]
repo = "/home/sid/repos/thursday"
version = "0.1.0"
harness = "command-code"
platform = "linux"   # linux | darwin | win32

[personal]
dir = "/home/sid/th"
procedures = "/home/sid/th/procedures"
scratch = "/home/sid/th/scratch"
scope = "global"     # or "repo"

[paths]
state = "/home/sid/.local/state/thursday"
temp = "/tmp/th-scratch"

[learned]
spiel = false
lenses = false
```

Rules:

- `install.repo` is what every pointer path resolves from
- `install.platform` lets later migrations branch without re-detecting
- the config is written by setup only
- usage and learning state go in an append-only sidecar in `[paths].state`, not
  in the file itself
- paths are absolute. If the user moves their repo, setup rewrites this one
  field; nothing else needs to know.

## Migrations

Setup is a sequence of migrations, not one script. Each migration is a file in
`migrations/`, numbered, and does one thing.

- `0001-setup.md` · first install
- each later one names what it changes and what to do with older procedures
- a migration is idempotent: running it twice is not an error
- when a procedure changes shape, the migration says what happens to a user's
  copy
- a migration that touches the filesystem resolves paths the same way setup does,
  and works on all three platforms

## Harness specifics

See `040-th-harnesses.md` for:

- where the skill directory lives, per harness and per platform
- how to register the load hook, so `/thursday` does not have to be remembered
- how to set up a persona so the user starts in Thursday mode

## Harm reduction

Do not install anything the user did not ask for. Do not edit shell profiles,
git configs, or global ignores without saying so first.

## Undo

Say this out loud during setup, not just in a file. Give the command for their
platform.

- delete the personal dir → removes procedures, scratch, and personal notes
- delete the config dir → removes the config and the usage sidecar
- delete the state dir → removes logs, caches, and schedules
- delete the generated `th-*` skill dirs → removes the pointers
- delete the root skill → Thursday is gone

Nothing else was written. No shell profile edits without asking.

