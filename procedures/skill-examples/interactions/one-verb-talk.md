---
thursday-note:
  desc: one verb, mid-prompt: /th
  undo: delete this file
thursday-revisit: 2026-11-11
---

# One verb, mid-prompt

exercises: `000-th-how-to-talk` `/th`

## Prompt

```
/th should the skill ship a dashboard for the tree, or is the svg enough?
```

## Response

```
READBACK
- thinking about what the renderer should be, not asking me to build it.
- not building.

PICTURE
- `scripts/tree-render.ts` already emits SVG and `.excalidraw`
- a dashboard is a third output with its own upkeep

NEXT
- option · keep it at two outputs
- option · prototype a dashboard before deciding

DATA
- the SVG opens in a browser with no dependencies
- a dashboard needs a server or a build step

FEEDBACK
- is the pain rendering, or finding the file afterwards?
```

## Decision

- keep two outputs

## What it shows

- reduce means fewer options, not no format
