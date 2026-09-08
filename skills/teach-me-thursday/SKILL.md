---
name: teach-me-thursday
description: Your first hour with Thursday. Chapter 1 runs a real ticket on a blog you make your own — you ask for login, sign off, verify, mark done. Chapter 2 compacts the session and recovers from it. Chapter 3 turns posting into a wizard you keep. Each chapter ends at a stopping point, and every step names the control to click.
whenToUse: First launch after Thursday install, or anytime the user wants to learn Thursday's workflow. Trigger phrases are "teach me thursday", "show me how to use thursday", "thursday tutorial", "i'm new to thursday", "how do i use the board", "how do i use the context tools".
---

# Teach Me Thursday

Your first hour with Thursday. A blog you make your own, and the workflow that runs it.

This file instructs the agent running the tour. Lines in quotes are said to the user. Everything else is agent procedure. Keep user-facing lines short. Explanations follow actions.

## Before you start

This workspace holds the tour material:

- `PLAN.md`: Five tour tickets
- `blog/`: A small blog that runs with `node blog/server.mjs`
- `blog/vendor/session.mjs`: A vendored session helper, already installed

There is no `wizards/` directory yet. Chapter 3 creates it.

## Chapter 1: The ticket lifecycle

Target: fifteen minutes. The user does the human half throughout: signoff, verification, mark-done. The agent never performs those.

### Step 1: See the blog (first minute)

No explanation first. The first user-facing message is the command:

> "Run this in a terminal, then open the address it prints:"
>
> `node blog/server.mjs`

If the server fails to start, the error names the cause. `EADDRINUSE` means the port is taken: change `PORT` in `blog/config.mjs` and run again. `node: command not found` means the install did not complete; stop and fix that first.

When the page loads, say one line:

> "That is your blog. It is plain and half of it is placeholder. The tour fixes that."

### Step 2: State the intent, then import

Ask what they want first. Do not open with the plan:

> "Tell me in your own words: what should this blog do that it does not?"

The expected answer is login. Whatever words they use, map them to ticket T1 aloud:

> "That is ticket T1. Importing the plan makes it concrete."

Then: the agent imports `PLAN.md` into the board. The board shows five tickets, all open. Point at T1 only. Say what it is in one line: the agent wires a login page and a drafts page behind it.

If the user names something other than login, note it and continue with T1 anyway: the remaining tickets depend on login existing. One sentence.

### Step 3: Sign off T1

> "Click T1. Click **Sign off** at the bottom of the detail view."

Before writing, the agent asks for paths. It requests `blog/` and nothing else. At that moment, one sentence:

> "It asked which paths it may write. That request is the allowlist. It is not a formality: outside those paths, the agent cannot write."

The agent then searches the workspace for prior art before writing. It finds `blog/vendor/session.mjs` and recommends it in its proposal, with the reason: the helper is already here, tested against this server, and session handling is not written by hand. At that moment, one sentence:

> "It searched before writing, and recommended the library it found. That is the practice, performed rather than described."

The agent wires the login and drafts pages, attaches its notes as evidence, and stops. At that moment, one sentence:

> "It stopped and it cannot proceed without you. That stop is why signoff exists, and why it is yours."

### Step 4: Verify T1 yourself

Do not verify by reading the evidence. The instrument is the browser:

> "Open `/drafts` without logging in. Then log in with the password in `blog/config.mjs`. Then try the wrong password."

Expected results: logged out redirects to `/login`; the password reaches the drafts page; the wrong password shows a rejection on the page. If any result differs, that is the report — the user tells the agent what the page showed, and the agent fixes it. A step that cannot fail teaches nothing; the page is what tells them.

When the three results match, in the ticket detail click **Verify**, then **Mark done**. At that moment, two sentences:

> "The evidence was the claim. Loading the pages was the check. And the ticket moved because you moved it — the agent cannot mark its own work done."

**Stopping point.** Say so: chapter 1 continues with T2 and T3. The board keeps finished tickets, so stopping here loses nothing.

### Step 5: T2 — the draft that should not be public

> "Open the front page. There are three posts. One of them is marked as a draft."

The post `draft-ideas` carries `draft: true` and is listed publicly. Sign off T2. The agent reads the parser and the listing logic, finds the mismatch, and fixes the filter. The diff is two lines.

Verification is the browser again: the front page lists two posts, and `/post/draft-ideas` without login returns not-found.

The anticipated stumble: the user reloads and the draft is still there. Cause: the server loads itself once at startup; post and style edits reload on their own, server edits do not. The fix is Ctrl-C in the terminal and `node blog/server.mjs` again. If the page looks unchanged after a server edit, say exactly that and nothing more — the symptom diagnoses itself on the second occurrence.

Verify, mark done.

### Step 6: T3 — make it theirs

> "Replace the placeholder posts with your own words. Set the title in `blog/config.mjs`. Change the stylesheet."

If the user has nothing prepared, one line is enough: one sentence of their own as a post, one title, two colours. The exercise must work with no preparation.

Failure paths, each diagnosed by what the page shows:

- A post shows its file name instead of a title: the front matter `title:` line is missing or the dashes are unbalanced.
- A post does not appear: the file does not end in `.md`.
- A style change is invisible: the browser cached the stylesheet. Hard reload (Ctrl-Shift-R).
- The title is unchanged: the server was not restarted after editing `config.mjs`. Same rule as step 5.

Verify (index returns 200, each post page returns 200), mark done. Chapter 1 ends. Three tickets of context now sit in the session; chapter 2 shrinks it and recovers from the shrunken form. The board keeps finished tickets, so stopping here loses nothing.

## Chapter 2: The context tools (optional)

Target: five minutes. The session now holds three tickets of real work: server code, auth wiring, posts, styles. That context is the subject.

### Step 1: Run `/compact`

> "Type `/compact` in the composer and press enter."

The session shrinks to a short deterministic summary. Same input, same summary, every run. No model summarises anything.

### Step 2: Ask for something elided

> "Ask about a detail from the last hour that the summary dropped — a filename, a password value, the exact filter line."

The agent does not know it from the summary. It runs `resume_search` against the elided content and answers exactly. If the search returns nothing, the query was too narrow: fewer words, then again. The tool reports what it searched; an empty result is information, not a dead end.

One sentence when the answer lands:

> "Compact shrinks the session. Resume recovers from it. The pair is what makes a session last."

State the stopping point. Chapter 3 is optional.

## Chapter 3: The second time (optional)

Target: ten minutes. The user did T3's post by hand: title, date, front matter, file in the right directory. Tedious, mechanical, repeated every time they publish.

### Step 1: Name what stays human

> "Publishing a post needs your title and your words. Nobody else has those. Everything after that is placement."

That distinction is why the wizard exists. A wizard is for the steps only a human can perform, with the mechanical remainder attached — which is the same boundary the whole product is built on: the agent waits on the user, never the reverse.

### Step 2: Build it and run it

Sign off T5. The agent writes `wizards/new-post.mjs` from the by-hand procedure in T3, not from invention: same directory, same front matter, same date format.

The user runs it, in the terminal:

`node wizards/new-post.mjs "My second post"`

A new post appears on the index. The user keeps the wizard. Test the edges once: empty title re-asks, a duplicate title refuses with the address that collides. Both messages come from the tool, not from this script.

If you would like a variant, let me know.

## After the tour

The acceptance test is stated, not implied:

> "Take your own work — not this blog. Write or import a small plan, and run one ticket end to end without referring back to this tour. If that stalls, the stall names what the tour failed to teach."

## Teaching map

Each concept and the exact moment it is taught. Review the sequencing here, not from assertion.

| Concept | Moment |
|---|---|
| Action before explanation | Ch1 step 1: the server command is the first message |
| Plan from intention | Ch1 step 2: own words first, import as the concrete form |
| Allowlist | Ch1 step 3: the agent requests `blog/` before writing |
| Prior-art search | Ch1 step 3: the vendored helper is recommended with its reason |
| Signoff | Ch1 step 3: the agent stops and cannot proceed |
| Evidence vs verification | Ch1 step 4: notes are the claim, loading pages is the check |
| Gate, done | Ch1 step 4: only the user moves the ticket |
| Restart rule | Ch1 step 5: the stale-page stumble, diagnosed once |
| Compact | Ch2 step 1: the session visibly shrinks |
| Resume | Ch2 step 2: an elided detail is recovered by query |
| Why wizards exist | Ch3 step 1: human steps named before anything is built |
| Building a wizard | Ch3 step 2: built from the by-hand procedure, run, kept |
