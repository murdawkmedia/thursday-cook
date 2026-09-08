/**
 * THE PHRASE SET, AND THE RULES IT HAS TO SURVIVE.
 *
 * `data/phrases.json` is the artifact; this file is the only thing that reads
 * it and the only place the rules are written down. The split matters for
 * TH3's last criterion: adding a phrase is a data change, and it still gets
 * checked, because the checks live here and the tests run them over whatever
 * the data file happens to contain.
 *
 * Everything exported is PURE. No DOM, no timers, no I/O beyond the bundler's
 * JSON import, so the whole rule set is node-testable and the tests can also
 * run the validators over deliberately-bad fixtures to prove they can fail.
 */

import data from "../data/phrases.json";

/** How the rotation is configured, from the data file. */
export interface RotationConfig {
  readonly intervalMs: number;
}

/** One named group of forbidden words, with the reason it exists. */
export interface VocabularyGroup {
  readonly $comment: string;
  readonly words: readonly string[];
}

/** Every phrase we ship, in file order. */
export const PHRASES: readonly string[] = data.phrases;

/** The rotation settings we ship. */
export const ROTATION: RotationConfig = data.rotation;

/** The forbidden-word groups, keyed by the criterion each one serves. */
export const VOCABULARY: Readonly<Record<string, VocabularyGroup>> = {
  mythology: data.vocabulary.mythology,
  toolNames: data.vocabulary.toolNames,
  modelNames: data.vocabulary.modelNames,
  systemNouns: data.vocabulary.systemNouns,
  operations: data.vocabulary.operations,
};

/**
 * TH3: "no phrase exceeds 32 characters, so the indicator line does not reflow
 * at the narrowest supported width".
 */
export const MAX_PHRASE_LENGTH = 32;

/**
 * Lowercase a phrase and cut it into word tokens on every non-letter.
 *
 * Tokenising rather than substring-matching is what makes the vocabulary lists
 * usable: "thoroughly" does not contain the TOKEN "thor", so an honest word is
 * not caught by a ban on the god; but "load-bearing" yields "load" and
 * "bearing", so a hyphen cannot be used to smuggle a banned word past the
 * check. Both of those cases were real phrases in the draft set.
 */
export function tokenize(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length > 0);
}

/** One rule a phrase broke, named well enough to fix without re-reading TH3. */
export interface Violation {
  readonly phrase: string;
  readonly rule: string;
  readonly detail: string;
}

/**
 * Anything that looks like a path, a filename, or a machine identifier.
 *
 * This is the half of "no phrase names a file" that a word list cannot do:
 * `src/index.ts`, `~/notes`, `camelCase`, `snake_case`, `SHOUTING` and any
 * token with a digit in it are all shapes, not words, so they are matched as
 * shapes. A phrase in Thursday's voice is prose; prose has none of these.
 */
const IDENTIFIER_SHAPES: ReadonlyArray<{ rule: string; pattern: RegExp; detail: string }> = [
  { rule: "file", pattern: /[/\\~]/, detail: "contains a path separator or a home-directory mark" },
  { rule: "file", pattern: /\.[a-z]{1,5}\b/i, detail: "contains a dotted file extension" },
  { rule: "file", pattern: /[a-z][A-Z]/, detail: "contains a camelCase identifier" },
  { rule: "file", pattern: /[a-z]_[a-z]/i, detail: "contains a snake_case identifier" },
  { rule: "file", pattern: /\b[A-Z]{2,}\b/, detail: "contains an ALL-CAPS identifier" },
  { rule: "model", pattern: /\d/, detail: "contains a digit, which is how model versions read" },
];

/**
 * Run every mechanical rule over one phrase and return what it broke.
 *
 * An empty array means the phrase passes everything this project can check by
 * machine -- which is NOT the same as "the phrase is fine". See the header of
 * tests/phrases.test.ts for the part that is judgement.
 */
export function findViolations(phrase: string): Violation[] {
  const violations: Violation[] = [];

  const length = [...phrase].length;
  if (length > MAX_PHRASE_LENGTH) {
    violations.push({
      phrase,
      rule: "length",
      detail: length + " characters, over the " + MAX_PHRASE_LENGTH + "-character limit",
    });
  }

  if (phrase.trim() !== phrase) {
    violations.push({ phrase, rule: "length", detail: "has leading or trailing whitespace" });
  }

  for (const shape of IDENTIFIER_SHAPES) {
    if (shape.pattern.test(phrase)) {
      violations.push({ phrase, rule: shape.rule, detail: shape.detail });
    }
  }

  const tokens = tokenize(phrase);
  for (const [group, definition] of Object.entries(VOCABULARY)) {
    for (const token of tokens) {
      if (definition.words.includes(token)) {
        violations.push({
          phrase,
          rule: group,
          detail: 'contains the forbidden word "' + token + '"',
        });
      }
    }
  }

  return violations;
}

/**
 * Normalise a phrase for comparison against somebody else's list: case,
 * punctuation, the trailing ellipsis every loading list uses, and runs of
 * whitespace all stop mattering. "Reticulating splines..." and "reticulating
 * splines" are the same phrase and must compare equal, or the originality
 * check is trivially defeated by a full stop.
 */
export function normalizeForComparison(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
