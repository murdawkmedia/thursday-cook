---
name: th
description: "/th · talk — read `000` and respond in that format"
---

Load the Thursday root skill if it is not already loaded this session or since the
last compaction.

`/th` means **talk**: read `000` and respond in that format. Also means: *you
answered in prose — say that again in the standard format, same information*

Then read `<personal>/procedures/000-th-how-to-talk.md` and follow it. The user's
personal dir comes first, always. Only if they have not set up a Thursday dir, or
that file is not there, read the shipped copy at
`<install.repo>/procedures/000-th-how-to-talk.md`.

Resolve `[personal].procedures` and `install.repo` from the `[personal]` and
`[install]` tables in the Thursday config:

  - Linux · `~/.local/share/thursday/thursday.toml`
  - macOS · `~/Library/Application Support/thursday/thursday.toml`
  - Windows · `%LOCALAPPDATA%\thursday\thursday.toml`

Do not guess either path. Never write to the checkout.
