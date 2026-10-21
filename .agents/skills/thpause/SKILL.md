---
name: thpause
description: "/thpause · leave — write the resume point; stop"
---

Load the Thursday root skill if it is not already loaded this session or since the
last compaction.

`/thpause` means **leave**: write the resume point; stop

Then read `<install.repo>/procedures/020-th-pause-resume.md` and follow it. Resolve
`install.repo` from the `[install]` table in the Thursday config:

  - Linux · `~/.local/share/thursday/thursday.toml`
  - macOS · `~/Library/Application Support/thursday/thursday.toml`
  - Windows · `%LOCALAPPDATA%\thursday\thursday.toml`

Do not guess the path.
