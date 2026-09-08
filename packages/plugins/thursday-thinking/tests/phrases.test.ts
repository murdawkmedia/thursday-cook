/**
 * THE CRITERIA, AS ASSERTIONS OVER data/phrases.json.
 *
 * Every test in this file reads the shipped data file. None of them restates
 * a phrase, so adding a phrase tomorrow is checked by the same code that
 * checked the twenty-two here today -- which is criterion 8 doing real work
 * rather than being a filing decision.
 *
 * READ THIS BEFORE TRUSTING THE FILE. Criterion 6 is "no phrase names a tool,
 * a file, a model, or an operation". Three quarters of that is mechanical and
 * is genuinely enforced below: tool names, model names and file/system nouns
 * are word lists, and file-ness is also a set of SHAPES (paths, extensions,
 * camelCase, digits) that prose never has. The fourth part is not fully
 * decidable, and pretending otherwise would be the worst thing in this file:
 *
 *   - Operations with no ordinary use in this register -- compiling, indexing,
 *     parsing, loading, fetching -- are on a list and are enforced.
 *   - Operations that are also plain English verbs -- sorting, counting,
 *     checking, holding, putting, looking -- are NOT, and cannot be, because
 *     banning them would ban the voice the ticket asks for. "Sorting the
 *     useful from the loud" would fail a naive verb check, and it should not.
 *
 * What closes that hole is structural rather than lexical: a phrase can only
 * CLAIM an operation if it also names the thing the operation runs on, and
 * `systemNouns` forbids naming one. So an ordinary verb is left with nothing
 * to act on but an abstraction. That is an argument, not a proof, and the
 * residue is a human review step at the moment a phrase is added.
 *
 * `rejects deliberately bad phrases` at the bottom exists so this file cannot
 * quietly become a suite that passes no matter what. It runs the same
 * validator over phrases that must fail, one per rule.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAX_PHRASE_LENGTH,
  PHRASES,
  ROTATION,
  VOCABULARY,
  findViolations,
  normalizeForComparison,
  tokenize,
} from "../src/phrases";
import { MINIMUM_INTERVAL_MS } from "../src/rotation";

/** The bytes on disk, so "the data file" means the file and not an import. */
const dataPath = fileURLToPath(new URL("../data/phrases.json", import.meta.url));
const raw = JSON.parse(readFileSync(dataPath, "utf8")) as {
  phrases: string[];
  rotation: { intervalMs: number };
  vocabulary: Record<string, { words: string[] }>;
};

describe("criterion 8: the phrase set is a data file", () => {
  it("is the file on disk, not a copy compiled into the source", () => {
    expect(PHRASES).toEqual(raw.phrases);
    expect(ROTATION.intervalMs).toBe(raw.rotation.intervalMs);
  });

  it("holds the forbidden vocabulary too, so banning a word needs no code change", () => {
    for (const [group, definition] of Object.entries(VOCABULARY)) {
      expect(definition.words, group).toEqual(raw.vocabulary[group]?.words);
      expect(definition.words.length, group).toBeGreaterThan(0);
    }
  });

  it("ships enough phrases that a full cycle is not obviously short", () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(12);
  });

  it("has no duplicates, which a shuffled queue would otherwise show twice", () => {
    expect(new Set(PHRASES).size).toBe(PHRASES.length);
  });

  it("has no two phrases that differ only in case or punctuation", () => {
    const normalized = PHRASES.map(normalizeForComparison);
    expect(new Set(normalized).size).toBe(normalized.length);
  });
});

describe("criterion 3: no phrase exceeds 32 characters", () => {
  it.each(PHRASES)("%s", (phrase) => {
    expect([...phrase].length).toBeLessThanOrEqual(MAX_PHRASE_LENGTH);
  });

  it("counts code points, so an accented or emoji phrase cannot slip past", () => {
    // A UTF-16 `.length` would call this 33 and a naive test would still pass
    // on the phrases we happen to ship today.
    expect([..."e\u0301".repeat(17)].length).toBe(34);
  });
});

describe("criterion 2: no Thor, Norse mythology, thunder, or weekday etymology", () => {
  it.each(PHRASES)("%s", (phrase) => {
    const hits = findViolations(phrase).filter((violation) => violation.rule === "mythology");
    expect(hits).toEqual([]);
  });

  it("covers the Romance branch as well as the Germanic one", () => {
    // "Thursday" reaches English through Thunor and German through Donar, but
    // through Jove in French and Italian. A list with only the Norse half
    // would wave "A quiet day for Jove" straight through.
    for (const word of ["thor", "thunor", "donar", "jove", "jupiter", "jeudi", "torsdag"]) {
      expect(VOCABULARY.mythology?.words, word).toContain(word);
    }
  });

  it("matches whole words, so an honest phrase is not caught by a prefix", () => {
    // "thoroughly" starts with "thor". A substring check would have banned a
    // perfectly good phrase and taught whoever hit it to weaken the list.
    expect(tokenize("Counting to ten, thoroughly")).not.toContain("thor");
    expect(findViolations("Counting to ten, thoroughly")).toEqual([]);
  });

  it("is not defeated by a hyphen", () => {
    // "load-bearing" tokenises to "load" + "bearing"; the draft phrase
    // "Looking for the load-bearing bit" was caught by exactly this and was
    // replaced rather than exempted.
    expect(tokenize("Looking for the load-bearing bit")).toContain("load");
    expect(findViolations("Looking for the load-bearing bit").map((v) => v.rule)).toContain(
      "operations",
    );
  });
});

describe("criterion 6: no phrase names a tool, a file, a model, or an operation", () => {
  it.each(PHRASES)("%s", (phrase) => {
    const hits = findViolations(phrase).filter((violation) =>
      ["toolNames", "modelNames", "systemNouns", "operations", "file", "model"].includes(
        violation.rule,
      ),
    );
    expect(hits).toEqual([]);
  });

  it("bans the tools an agent in this harness can actually call", () => {
    for (const word of ["read", "write", "edit", "bash", "grep", "glob", "fetch", "subagent"]) {
      expect(VOCABULARY.toolNames?.words, word).toContain(word);
    }
  });

  it("bans the operation this indicator is most tempted to claim", () => {
    // A loading indicator that says "Loading" is the exact failure the
    // criterion is written against.
    expect(VOCABULARY.operations?.words).toContain("loading");
  });
});

describe("criterion 4: the shipped interval clears the 2.5 second floor", () => {
  it("is at least " + MINIMUM_INTERVAL_MS + "ms", () => {
    expect(ROTATION.intervalMs).toBeGreaterThanOrEqual(MINIMUM_INTERVAL_MS);
  });

  it("is a finite number of milliseconds and not, say, a string", () => {
    expect(typeof ROTATION.intervalMs).toBe("number");
    expect(Number.isFinite(ROTATION.intervalMs)).toBe(true);
  });
});

describe("the whole set passes every mechanical rule at once", () => {
  it("reports no violations", () => {
    const all = PHRASES.flatMap(findViolations);
    expect(all).toEqual([]);
  });
});

/**
 * THE META-TEST. Without this, every assertion above could be satisfied by a
 * validator that returns an empty array unconditionally, and the suite would
 * be a decoration. Each case below must produce a violation of a named rule.
 */
describe("the validator rejects deliberately bad phrases", () => {
  const mustFail: Array<[string, string, string]> = [
    ["length", "Thursday is thinking about it very carefully indeed", "over 32 characters"],
    ["mythology", "Summoning the hammer", "Norse imagery"],
    ["mythology", "Waiting for the thunder", "thunder"],
    ["mythology", "Named for a Norse god", "mythology outright"],
    ["mythology", "Considering the etymology", "weekday etymology"],
    ["toolNames", "Reading between the lines", "names the read tool"],
    ["toolNames", "Grepping for a better one", "names the grep tool"],
    ["modelNames", "Asking Claude politely", "names a model"],
    ["model", "Consulting GPT 4 briefly", "a digit reads as a version"],
    ["systemNouns", "Turning over the cache", "names a system object"],
    ["file", "Weighing src/index.ts", "path and extension shapes"],
    ["file", "Checking myOwnHomework", "a camelCase identifier"],
    ["file", "Checking my own HOMEWORK", "an ALL-CAPS identifier"],
    ["operations", "Compiling a better answer", "names an operation"],
    ["operations", "Loading something useful", "the operation of loading"],
    ["operations", "Reticulating splines", "the phrase this ticket exists to avoid"],
  ];

  it.each(mustFail)("rejects %s: %s (%s)", (rule, phrase) => {
    const violations = findViolations(phrase);
    expect(violations.length, phrase + " should have been rejected").toBeGreaterThan(0);
    expect(violations.map((violation) => violation.rule)).toContain(rule);
  });

  it("accepts a phrase that breaks nothing, so it is not rejecting everything", () => {
    expect(findViolations("Turning it over once more")).toEqual([]);
  });
});
