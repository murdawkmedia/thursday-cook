---
thursday-note:
  desc: proc
  mechanical: true
thursday-revisit: 2026-11-11
verb: [/thproc]
---

Concept: Turn a process into a procedure — the one that just ran, or the one about
to. The rules for writing one are in `050-th-procedures.md`; this is the gesture.

## Why?

The moment to write a procedure down is right after it was fiddly. The steps are
still exact, the failure that nearly happened is still fresh, and the next run is
soon enough to test it.

Memory is the wrong source. A procedure written from imagination is fiction, and
fiction is worse than nothing because it is trusted.

## Two shapes

Read the message and pick one:

- **record** — it already happened. This is the common case: "we just did that,
  write it down."
- **start** — it has not happened. Scaffold the shape now, so the first real run
  fills it in. Say out loud that it is untested.

## General procedure

1. **Record from what ran, not from memory.** For a process in this session, read
   the transcript back with `scripts/sessions-viewer.ts` — the commands, the
   order, the thing that failed. Quote the user's own words for the trigger.
2. **Read back and wait.** Four lines, and no procedure file until they confirm:
   - what triggers it
   - what it produces, and how you know it worked
   - the stop condition — when to stop instead of continue
   - the undo
   Two questions at most. Do not interview them.
3. **Ask whether it deserves to exist.** A one-off, a thing a script should do, or
   something a shipped procedure already covers is not a procedure. Every
   procedure is future maintenance. Say so and offer the script instead.
4. **Write it by `050-th-procedures.md`.** Naming, template shape, override order,
   revisit dates. Do not restate any of it here. If 050 does not answer something,
   that is a gap in 050 — fix it there.
5. **Put it in their dir**: `<personal>/procedures/user-yyy-<slug>.md`. The repo's
   `procedures/` is only for Thursday itself.
6. **Name the door.** Add it to the root skill's procedure list if it should be
   found without being asked for. Give it a verb only if it needs a gesture, and
   then add the row to the verb table and regenerate the skills.
7. **Set `thursday-revisit`** to the date the question "is this still earning its
   keep?" becomes answerable. A month is a guess; a date tied to a real event is
   not.
8. **Verify.** The file resolves through `th-proc`, every template field is filled,
   the stop condition is a real condition, and the undo names a delete.

## Harm reduction

- Do not invent a step to make the procedure look complete. Mark a guessed step as
  unverified, or leave it out and say what is missing.
- Do not write one mid-crisis. Offer it after.
- A procedure the user will not follow is noise. Prefer the shortest version that
  still works.
- If the process changed while you were writing it, stop and start again from what
  actually ran.

## Undo

Delete this file and the `/thproc` skill. Procedures already written stay; they
are the user's.
