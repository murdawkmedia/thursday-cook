---
name: thlearn
description: "/thlearn · learn — help them learn and remember Thursday, or answer a question"
---

Load the Thursday root skill if it is not already loaded this session or since the
last compaction.

`/thlearn` means **learn**: help them learn and remember Thursday, or answer a
question

Then read `<personal>/procedures/030-th-learn.md` and follow it. The user's personal
dir comes first, always. Only if they have not set up a Thursday dir, or that file
is not there, read the shipped copy at `<install.repo>/procedures/030-th-learn.md`.

Resolve `[personal].procedures` and `install.repo` from the `[personal]` and
`[install]` tables in the Thursday config:

  - Linux · `~/.local/share/thursday/thursday.toml`
  - macOS · `~/Library/Application Support/thursday/thursday.toml`
  - Windows · `%LOCALAPPDATA%\thursday\thursday.toml`

Do not guess either path. Never write to the checkout.
