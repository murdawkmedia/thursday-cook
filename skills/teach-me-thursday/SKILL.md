---
name: teach-me-thursday
description: Your first hour with Thursday. Chapter 1 walks a real ticket through its lifecycle — you propose, I work, you verify and mark done. Chapter 2 shows the context tools: /compact shrinks a session and resume recovers what was elided. You can stop after chapter 1, and every step names the control to click.
whenToUse: First launch after Thursday install, or anytime the user wants to learn Thursday's workflow. Trigger phrases are "teach me thursday", "show me how to use thursday", "thursday tutorial", "i'm new to thursday", "how do i use the board", "how do i use the context tools".
---

# Teach Me Thursday

Your first hour with Thursday. Learn the ticket lifecycle, then the context tools that make a session last.

## Before you start

This workspace holds the tour material:

- `PLAN.md`: Three sample tickets you'll work through
- `sample-files/`: Toy source code to compact and recover in Chapter 2
- This skill: step-by-step instructions

You already have everything you need. Your only decision is whether to press enter.

---

## Chapter 1: The ticket lifecycle

You control the human half. The agent cannot sign off its own work or mark a ticket done — those are your calls, and that is the whole premise.

### Step 1: Import the plan

The board is empty. In the composer, you'll see `/teach-me-thursday` prefilled. Hit enter or click send. The agent loads this skill and guides you to the first step.

The board shows tickets from `PLAN.md`, all open. Each one is a small task:

- **T1**: Read three files and summarize them
- **T2**: Edit a file based on the summary
- **T3**: Verify the edit is correct

These are real tasks with real files in this workspace. You're about to run an actual agent session against real material.

### Step 2: Pick T1 and sign it off

Click on T1 (the first ticket). The detail view opens. At the bottom, click **Sign off**. The agent now has permission to work.

You'll see:
1. The agent reads the files (it uses `read`, `grep`, and `glob` tools)
2. The agent summarizes what it found
3. The agent attaches evidence to the ticket
4. The agent reports "done, waiting for you to verify"

**This is the moment the agent stops.** It cannot proceed without you. Automated systems that sign off their own work are a trap; Thursday does not do that.

### Step 3: Review and verify

In the ticket detail, scroll to **Evidence**. You see what the agent reported. Read it. Does it answer the question? The agent did read the files, and the summary is fair.

Click **Verify**. This is you saying "I checked this and it is right."

The agent's evidence is now locked in. T1 has moved from `open` to `awaiting_verification`. You have completed verification; the agent cannot.

### Step 4: Mark done

You're still in the ticket detail. At the top, the state button now says **Mark done**. Click it. The ticket moves to done.

**Stop here if you want.** You have completed the lifecycle: you signed off, you verified, you marked done. The agent worked inside its allowlist, every step was visible, and every human decision was yours.

---

## Chapter 2: The context tools (optional)

This chapter shows why Thursday's session matters. You'll see a session with real context being compressed down by `/compact`, and then you'll ask for something that was cut, and the agent recovers it with `resume`.

### Step 1: Work through T2 and T3

In the board, you'll now have T1 done. Pick T2. Read the task: it asks you to edit one of the sample files based on what you learned in T1. Sign it off. The agent reads the summary from T1, makes the edit, and reports done.

Verify and mark done.

Then T3: does the edit work correctly? Sign it off, review the evidence, verify, mark done.

When you finish T3, you'll have a session with three turns of real work and three pieces of evidence. The session is no longer empty.

### Step 2: Run `/compact`

In the composer, type `/compact` and press enter. Watch what happens:

The agent summarizes the session. The summary is short — maybe 20 lines — where the full session was 50+ turns and thousands of lines. The session log on disk shrinks by a factor of 5 or more.

**This is deterministic.** Run `/compact` again and you get the same summary every time. No neural network summarization, no lossy compression. The tool is reproducible and the result is readable.

### Step 3: Ask for something that was cut

The compaction summary is readable, but some details are gone. In the composer, ask something like:

> You summarized my work. What was the exact name of the first file I asked you to read?

The agent doesn't know. The summary didn't list the filename. But it has a tool: `resume_search`. It searches the elided content without reading the whole session.

The agent runs `resume_search("filename")` against the session log, and the answer comes back: it was `data-structure.ts`. The agent reports the exact answer.

**This is the pair that makes Thursday's session work.** Compact shrinks instantly and deterministically. Resume recovers anything without unreading the whole log. Together they mean your session is as long as you need and still as readable as it needs to be.

---

## That's it

You've learned the ticket lifecycle and the context tools. Everything else in Thursday is built on these two foundations.

If you have questions, ask in the chat. If you want to explore further, click on the board's gear icon and read the AGENTS.md rules file. If you want to look at how the workspace is set up, click the folder icon and browse the files.

Thursday is a conversation with your computer to get work done. You are in control.
