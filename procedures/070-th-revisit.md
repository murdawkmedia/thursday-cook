---
thursday-note:
  desc: revisit
  mechanical: true
verb: [/threvisit]
thursday-revisit: 2026-11-11
---

Concept: Everything Thursday writes carries a date it should be looked at again.
`/threvisit` surfaces the ones that are due and helps the user plan them.

## Why?

The point of a revisit date is that the user can forget the thing entirely until
the date arrives. That only works if something actually brings it back.

Without a surface, revisit dates are decoration: written once, never read, and the
artifact rots in place.

## `/threvisit`

1. Collect every `thursday-revisit` in reach:
   - `procedures/` in the repo and in the user's Thursday dir
   - `scratch/` at the relevant level
   - files with a `thursday-note` frontmatter block
   - anything a procedure recorded as a revisit
2. Sort by date. Show three buckets:
   - **overdue** · date has passed
   - **due soon** · within the next two weeks
   - **later** · everything else, one line each
3. For each overdue or due item, say in one line what it is and what the question
   is. Do not decide for the user.
4. Offer exactly one next step per item, in this shape:
   - keep · it is still earning its keep; push the date out
   - change · it needs an edit; say what
   - delete · it did its job; remove it
5. Wait. `/threvisit` never edits anything on its own. The user picks.
6. If nothing is due, say so in one line and stop.

## Writing a good revisit

- a date, not a duration. `2026-11-11`, not "in a month".
- the date should be the point at which the answer to a question becomes obvious,
  not an arbitrary interval.
- pair it with the question in `thursday-note.desc`, so future-you knows what was
  being wondered about.

## Planning

If the user wants to think about a revisit rather than act on it:

- say what changed since the date was set, if anything
- say what the original question was
- offer the smallest thing that would answer it

This is a thinking phase, not a build phase. See
`010-th-situational-awareness.md`.

## Harm reduction

Do not nag. One pass, three buckets, one next step each. If the user says later,
push the dates and move on.

## Notes

- a revisit that gets pushed three times is a candidate for deletion

## Undo

Delete this file. Revisit dates already written into artifacts stay greppable; they
simply stop being collected.
