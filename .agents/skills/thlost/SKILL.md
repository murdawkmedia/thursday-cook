---
name: thlost
description: "/thlost · reorient — rebuild session and project state; stop everything else"
---

Load the Thursday root skill if it is not already loaded this session or since the
last compaction.

`/thlost` means **reorient**: rebuild session and project state; stop everything
else

Then read `<personal>/procedures/010-th-situational-awareness.md` and follow it. The
user's personal dir comes first, always. Only if they have not set up a Thursday
dir, or that file is not there, read the shipped copy at
`<install.repo>/procedures/010-th-situational-awareness.md`.

Resolve `[personal].procedures` and `install.repo` from the `[personal]` and
`[install]` tables in the Thursday config:

  - Linux · `~/.local/share/thursday/thursday.toml`
  - macOS · `~/Library/Application Support/thursday/thursday.toml`
  - Windows · `%LOCALAPPDATA%\thursday\thursday.toml`

Do not guess either path. Never write to the checkout.
