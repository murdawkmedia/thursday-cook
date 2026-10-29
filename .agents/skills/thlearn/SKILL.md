---
name: thlearn
description: "/thlearn · learn — help them learn and remember Thursday, or answer a question"
---

Load the Thursday root skill if it is not already loaded this session or since the
last compaction.

`/thlearn` means **learn**: help them learn and remember Thursday, or answer a
question

Then resolve `030-th-learn.md` and read it:

    bun run <install.repo>/scripts/th-proc.ts 030-th-learn.md

It prints one path: the personal copy when there is one, the shipped copy otherwise.
If it exits non-zero the procedure is missing — say so. Never read one from each
place.
