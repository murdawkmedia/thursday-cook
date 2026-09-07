# Thursday tour

Learn the ticket lifecycle and context tools in your first hour.

## Vision

The tour walks you through working with Thursday: sign off a ticket to let an agent work, review its evidence, verify it's correct, mark it done. Then you see the context tools that make long sessions stay readable.

## Critical context

- The tour uses real TypeScript code, not simplified examples
- T2 has an intentional bug that a type system would catch
- Chapter 2 is optional — you can stop after Chapter 1
- Everything here stays when you uninstall Thursday

## Phase 1: Ticket lifecycle

- [ ] **Ticket T1: Read and summarize the sample files.** You have three TypeScript files in `sample-files/`. Read them all and write one paragraph explaining what each file defines and how they work together.

  **Evaluate:**

  - the summary reads all three files
  - the summary explains what data-structure.ts defines
  - the summary explains how factory.ts and api-usage.ts use it

- [ ] **Ticket T2: Fix the bug in api-usage.ts.** Based on your summary, find the bug: a function call that passes only one argument when two are required. Fix it.

  **Evaluate:**

  - the file is edited
  - the function call now has two arguments
  - both arguments match the function signature

- [ ] **Ticket T3: Verify the fix works.** Check that the change in T2 is correct by reading the function signature and confirming the second argument is the right type.

  **Evaluate:**

  - the evidence quotes both the function signature and the fixed call
  - the evidence explains why the argument type is correct

## Phase 2: Context tools

- [ ] **Ticket T4: Ask about something elided.** After completing T1–T3, run `/compact` to shrink the session. Then ask the agent about one specific detail from T1 that's not in the summary (like the exact filename of one of the sample files). The agent will use `resume_search` to recover it.

  **Evaluate:**

  - the agent uses resume_search, not unreading the full session
  - the answer is exact and specific
  - the agent explains how it recovered the detail
