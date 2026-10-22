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

**Thursday root** — everything the install owns lives under one directory

- Linux · `${XDG_DATA_HOME:-~/.local/share}/thursday/`
- macOS · `${XDG_DATA_HOME:-~/Library/Application Support}/thursday/`
- Windows · `%LOCALAPPDATA%\thursday\`

Honor `XDG_DATA_HOME` if set, on any platform. That is the escape hatch for
people who keep their dotfiles in one place.

Inside the root:

```txt
thursday.toml   the only static path; everything else resolves from it
checkout/       git clone of thursday
state/          usage sidecar, logs, caches, schedules
.gitignore      ignores checkout/ and state/
```

The `.gitignore` exists so a dotfiles repo that swallows `~/.local/share` leaves
the clone and the state out. `thursday.toml` stays tracked: it is the one file
worth restoring on a new machine.

**Personal dir defaults** — the user's own procedures, scratch, and notes. Kept
outside the root so it survives a reinstall.

- Linux · `~/th`
- macOS · `~/Documents/Thursday`
- Windows · `%USERPROFILE%\th`

**Temp scratch** — `<system temp>/th-scratch`, `/tmp/th-scratch` on Unix,
`%TEMP%\th-scratch` on Windows.

Resolve all of these through the platform's own conventions, then store absolute
paths in the toml. Do not store `~` or `%VAR%` — they do not expand consistently.

## General procedure

1. **Greet.** One line. Say what Thursday is for, in their terms, not ours.
2. **Detect the platform.** OS, shell, and where their agent loads skills.
   Ask only if detection is genuinely ambiguous.
3. **Read the config.** If it exists and is current, say so and stop — this is
   not a reinstall.
4. **Ask one question.** Where should personal Thursday state live? Offer the
   platform default first, the other common option second.
   - Linux · `~/th` or `~/Documents/Thursday`
   - macOS · `~/Documents/Thursday` or `~/th`
   - Windows · `%USERPROFILE%\th` or `Documents\Thursday`
   Do not ask anything else yet.
5. **Get bun, if it is missing.** `sh scripts/bunstrap.sh` on Unix,
   `powershell -File scripts\bunstrap.ps1` on Windows. It uses a bun that is
   already on PATH, and otherwise installs a pinned version into the root's own
   `bin/`. Never install bun system-wide and never edit a shell profile.
   If bunstrap cannot reach the network, say so and fall back to writing the
   files by hand from the rules in `050-th-procedures.md`; a real user got a
   working install that way.
6. **Create the root.** Everything below names something in the undo, so each one
   is created explicitly:
   - the root, `state/`, and `.gitignore`
   - `checkout/` — a git clone of Thursday. If it is already there, leave it and
     say so; a second run is not a reinstall
   - the personal dir, and `scratch/` and `procedures/` inside it
   - never copy the shipped procedures in. The checkout is the only copy; the
     personal `procedures/` holds only what the user writes (`user-yyy-*`)
7. **Write the config.** The single static path resolved above. Everything else
   resolves from it. See the shape below.
8. **Install the skills.** From the checkout, copy
   `.agents/skills/thursday/SKILL.md` into the skills dir the user gave, and run
   `bun run scripts/gen-th-skills.ts --out <skills dir>`. See
   `040-th-harnesses.md` for where each harness keeps them, per platform.
9. **Offer the default, once.** The install is a skill the user triggers; that is
   the default unless they say otherwise. Right after it works, ask once whether
   they would like Thursday to be the default mode in their harness.
   - yes · register the load hook or persona, and name the undo
   - no · accept it and move on. Do not ask why
   Ask again only after they have used Thursday to finish five goals. That is when
   it is fair to ask what would have to change. See `045-th-feedback.md`.
10. **Turn off yolo mode.** One of the first things. Make the shell tool
   always-ask, and say the exact setting for their shell:
   - bash / zsh · the harness's confirmation setting, or a wrapper
   - fish · same, via `fish` config if the harness uses it
   - PowerShell · same, via the harness's setting
   - Windows native without a POSIX shell · the harness's command tool
   Taking back situational awareness is the point. They can re-enable
   auto-accept deliberately when they want a burst of autonomy.
11. **Verify.** Read the config back, list the generated skills, and check that
    every skill pointing at a procedure resolves to a file that exists, using
    forward slashes or native separators as the platform expects. If a procedure
    is missing, say so rather than shipping a dangling skill.
12. **Recommend `/thlearn 5`.** One sentence. Do not explain the rest of the
    verbs.

## Config shape

```toml
# resolved per platform — see "Resolve paths first"
[install]
repo = "/home/sid/.local/share/thursday/checkout"
version = "0.1.0"
skills = "/home/sid/.commandcode/skills"
bun_path = "/home/sid/.bun/bin/bun"
platform = "linux"   # linux | darwin | win32

[personal]
dir = "/home/sid/th"
procedures = "/home/sid/th/procedures"
scratch = "/home/sid/th/scratch"
scope = "global"     # or "repo"

[paths]
root = "/home/sid/.local/share/thursday"
state = "/home/sid/.local/share/thursday/state"
temp = "/tmp/th-scratch"

[learned]
spiel = false
lenses = false
```

Rules:

- `install.repo` is the checkout every skill path resolves from
- `install.bun_path` is the bun that ran setup. Use it for later runs instead of
  re-detecting, so a bootstrapped bun in `<root>/bin` keeps working
- `install.platform` lets later migrations branch without re-detecting
- the config is written by setup only
- usage and learning state go in an append-only sidecar in `[paths].state`, not
  in the file itself
- paths are absolute. If the user moves the root, setup rewrites these fields;
  nothing else needs to know.

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

- delete the Thursday root → removes the config, the checkout, and the state
- delete the generated verb skill dirs → removes the verbs
- delete the personal dir → removes the user's procedures, scratch, and notes.
  Setup never creates anything in it that the user did not ask for, but it is
  their content, so name it separately instead of sweeping it up

Nothing else was written. No shell profile edits without asking.

