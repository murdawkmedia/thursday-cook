/**
 * CRITERION 1: "every phrase is original to Thursday: each one is searched for
 * verbatim before it ships, and a phrase found in an existing published list
 * is replaced."
 *
 * WHAT THIS FILE CAN AND CANNOT DO, because the distinction is the whole point.
 *
 * A test cannot search the web. What it CAN do is hold the published lists
 * still and check against them, which is the half of the criterion that has a
 * definite answer -- and it is the half that decides replacement, since the
 * criterion's trigger is "found in an existing published list", not "found
 * anywhere in English". `tests/fixtures/published-lists.json` is 481 messages
 * harvested from the three collections this ecosystem actually reuses:
 *
 *   - the SimCity-descended gist that most "funny loading messages" blog posts
 *     copy from        https://gist.github.com/meain/6440b706a97d2dd71574769517e7ed32
 *   - loadr's 202-message list   https://github.com/dimitarchristoff/loadr
 *   - happy-load                 https://github.com/pagedip/happy-load
 *
 * Checking in the corpus rather than fetching it at test time is deliberate:
 * the suite stays offline and deterministic, and the comparison is reviewable
 * in a diff. The cost is that the fixture ages, so refreshing it is a chore
 * someone has to do; `scripts/refresh-published-lists.mjs` does it.
 *
 * THE MANUAL HALF, recorded here so it is not lost: every phrase in the
 * shipped set was also searched verbatim on the open web while TH3 was being
 * built. The finding worth passing on is that this test is the useful one and
 * the web search mostly is not -- any four-word English phrase in this
 * register turns up in somebody's prose. "Weighing two bad options" and
 * "Putting it in a sensible order" both appear mid-sentence in published
 * writing, and so did every replacement drafted for them. Prose collision is
 * not the criterion's trigger and cannot be made into one without emptying the
 * phrase set. What WAS acted on: a collision with a published list (caught
 * below), and a collision with a titled or branded line that somebody clearly
 * coined. The TH3 report names each one.
 */

import { describe, expect, it } from "vitest";

import { PHRASES, normalizeForComparison } from "../src/phrases";
import published from "./fixtures/published-lists.json";

interface PublishedMessage {
  src: string;
  text: string;
}

const CORPUS: PublishedMessage[] = published.messages;

/** Word-set overlap, so a reordering or an added adverb still scores high. */
function overlap(a: string, b: string): number {
  const left = new Set(normalizeForComparison(a).split(" ").filter(Boolean));
  const right = new Set(normalizeForComparison(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

/**
 * The line between "two phrases about thinking" and "the same phrase".
 *
 * Chosen from the data rather than picked out of the air. The draft set's
 * "Counting to ten, thoroughly" scored 0.75 against loadr's published
 * "Counting to Ten" -- it was that entry plus an adverb -- and was replaced.
 * The next-highest score in the whole draft was 0.33, a coincidence of the
 * word "the". 0.5 sits in the gap with room on both sides.
 */
const MAX_ALLOWED_OVERLAP = 0.5;

describe("the corpus itself", () => {
  it("is big enough to be worth checking against", () => {
    expect(CORPUS.length).toBeGreaterThan(400);
  });

  it("covers all three published sources", () => {
    const sources = new Set(CORPUS.map((message) => message.src));
    expect([...sources].sort()).toEqual(["happy-load", "loadr", "meain-gist"]);
  });

  it("contains the phrase every one of these lists descends from", () => {
    // If this ever fails the fixture is broken, and every assertion below it
    // would pass vacuously against an empty or malformed corpus.
    const normalized = CORPUS.map((message) => normalizeForComparison(message.text));
    expect(normalized).toContain("reticulating splines");
  });
});

describe("criterion 1: no phrase appears in a published list", () => {
  const publishedNormalized = new Set(CORPUS.map((m) => normalizeForComparison(m.text)));

  it.each(PHRASES)("%s is not a published message", (phrase) => {
    expect(publishedNormalized.has(normalizeForComparison(phrase))).toBe(false);
  });

  it.each(PHRASES)("%s does not contain, and is not contained by, one", (phrase) => {
    // The containment check is what catches "<published entry> + an adverb",
    // which is how the one real collision in the draft set was shaped.
    const ours = normalizeForComparison(phrase);
    const containing = CORPUS.filter((message) => {
      const theirs = normalizeForComparison(message.text);
      if (theirs.split(" ").length < 2) return false;
      return ours.includes(theirs) || theirs.includes(ours);
    });
    expect(containing.map((message) => message.text)).toEqual([]);
  });

  it.each(PHRASES)("%s is not a near-duplicate of one", (phrase) => {
    let worst = { score: 0, text: "" };
    for (const message of CORPUS) {
      const score = overlap(phrase, message.text);
      if (score > worst.score) worst = { score, text: message.text };
    }
    expect(worst.score, phrase + " vs published " + JSON.stringify(worst.text)).toBeLessThan(
      MAX_ALLOWED_OVERLAP,
    );
  });
});

describe("the near-duplicate check can actually fail", () => {
  it("scores the collision that was found and removed above the threshold", () => {
    // "Counting to ten, thoroughly" was in the draft set until this check ran.
    expect(overlap("Counting to ten, thoroughly", "Counting to Ten")).toBeGreaterThan(
      MAX_ALLOWED_OVERLAP,
    );
  });

  it("treats punctuation and an ellipsis as noise", () => {
    expect(overlap("Reticulating splines", "Reticulating splines...")).toBe(1);
  });

  it("does not flag two unrelated phrases", () => {
    expect(overlap("Choosing my omissions", "Reticulating splines")).toBeLessThan(
      MAX_ALLOWED_OVERLAP,
    );
  });
});
