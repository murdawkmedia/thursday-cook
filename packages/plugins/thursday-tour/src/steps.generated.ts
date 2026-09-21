/**
 * GENERATED FILE -- DO NOT EDIT.
 *
 * Source of truth: data/steps.yaml.
 * Regenerate with: pnpm --filter @trythursday/thursday-tour run steps.
 * The sync test (tests/steps.test.ts) fails if this drifts from the YAML.
 */
import type { TourStep } from "./steps";

export const PLAN_TICKETS: readonly string[] = ["T1","T2","T3","T4","T5"];

export const STEPS: readonly TourStep[] = [
  {
    "id": "see-blog",
    "chapter": 1,
    "ticket": "T1",
    "text": "Run this in a terminal, then open the address it prints:\n`node blog/server.mjs`\nThat is your blog. It is plain and half of it is placeholder. The tour fixes that.",
    "target": "[data-composer-seat]",
    "teaching": "Action before explanation: the server command is the first message.",
    "done": {
      "op": "manual"
    }
  },
  {
    "id": "state-intent",
    "chapter": 1,
    "ticket": "T1",
    "text": "Tell me in your own words: what should this blog do that it does not?\nThat is ticket T1: a login page and a drafts page behind it. Importing the plan makes it concrete.",
    "target": "[data-composer-seat]",
    "teaching": "Plan from intention: own words first, import as the concrete form.",
    "done": {
      "op": "manual"
    },
    "prefill": "Add login to my blog"
  },
  {
    "id": "signoff-t1",
    "chapter": 1,
    "ticket": "T1",
    "text": "Click T1, then **Sign off**. The agent asked for `blog/` and nothing else -- that request is the allowlist, and outside those paths it cannot write. It searched first and recommended the vendored session helper with its reason. Now it stops, and it cannot proceed without you.",
    "target": "[data-conversation-scroll]",
    "teaching": "Signoff is yours: the agent stops and cannot proceed without you.",
    "done": {
      "op": "manual"
    }
  },
  {
    "id": "verify-t1",
    "chapter": 1,
    "ticket": "T1",
    "text": "Open `/drafts` without logging in, then log in with the password in `blog/config.mjs`, then try the wrong password. Logged out redirects to `/login`; the password reaches drafts; the wrong password is rejected on the page. When all three match, **Verify**, then **Mark done** -- the ticket moved because you moved it.",
    "target": "[data-conversation-scroll]",
    "teaching": "Evidence is the claim; loading the pages is the check.",
    "done": {
      "op": "ticket-done",
      "ticket": "T1"
    }
  },
  {
    "id": "fix-draft",
    "chapter": 1,
    "ticket": "T2",
    "text": "Open the front page: three posts, one marked draft, and `draft-ideas` is listed publicly. Sign off T2. The fix is two lines in the listing logic. If the page looks unchanged after a server edit, restart it: the server loads once, posts and styles reload on their own.",
    "target": "[data-conversation-scroll]",
    "teaching": "The restart rule: server edits need a restart; post and style edits do not.",
    "done": {
      "op": "ticket-done",
      "ticket": "T2"
    }
  },
  {
    "id": "make-yours",
    "chapter": 1,
    "ticket": "T3",
    "text": "Replace the placeholders with your own words, set the title in `blog/config.mjs`, restyle the sheet. One sentence, one title, two colours is enough. Missing title means unbalanced front-matter dashes; missing post means no `.md` suffix; invisible style means cached CSS.",
    "target": "[data-composer-seat]",
    "teaching": "Chapter 1 ends here: three tickets of context the next chapter shrinks.",
    "done": {
      "op": "ticket-done",
      "ticket": "T3"
    }
  },
  {
    "id": "run-compact",
    "chapter": 2,
    "ticket": "T4",
    "text": "Type `/compact` in the composer and press enter. The session shrinks to a short deterministic summary -- same input, same summary, every run. No model summarises anything.",
    "target": "[data-composer-seat]",
    "teaching": "Compact shrinks the session to a deterministic summary.",
    "done": {
      "op": "command-ran",
      "command": "/compact"
    }
  },
  {
    "id": "ask-elided",
    "chapter": 2,
    "ticket": "T4",
    "text": "Ask about a detail the summary dropped -- a filename, a password value, the exact filter line. The agent runs `resume_search` against the elided content and answers exactly. If the search returns nothing, the query was too narrow: fewer words, then again.",
    "target": "[data-composer-seat]",
    "teaching": "Resume recovers from compaction: the pair is what makes a session last.",
    "done": {
      "op": "manual"
    }
  },
  {
    "id": "name-human",
    "chapter": 3,
    "ticket": "T5",
    "text": "Publishing needs your title and your words -- nobody else has those. Everything after that is placement. That distinction is why the wizard exists: a wizard is for the steps only a human can perform, with the mechanical remainder attached.",
    "target": "[data-conversation-scroll]",
    "teaching": "Why wizards exist: human steps first, machinery attached.",
    "done": {
      "op": "manual"
    }
  },
  {
    "id": "build-wizard",
    "chapter": 3,
    "ticket": "T5",
    "text": "Sign off T5. The agent writes `wizards/new-post.mjs` from your by-hand T3 procedure -- same directory, same front matter, same date format. Run it once and keep it: empty title re-asks, duplicate refuses with the colliding address. Then take your own work and run one ticket without this tour.",
    "target": "[data-composer-seat]",
    "teaching": "Built from the by-hand procedure, run once, kept -- then the tour lets go.",
    "done": {
      "op": "file-exists",
      "path": "wizards/new-post.mjs"
    }
  }
];
