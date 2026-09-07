/**
 * meridian-breaker/prompt — what the user is told, and what we refuse to claim.
 *
 * ── The honesty constraint, which is a finding and not caution ───────────
 *
 * Issue #895 IS the matching upstream report for this error string, so we link
 * it. But #895 is titled "Session-cache doesn't get garbage-collected on
 * Windows", and its fix PR #896 states the mechanism outright: "Session GC is a
 * no-op on Windows because fenced deletion assumes POSIX process groups."
 *
 * This machine is Linux, where that POSIX path is the one that WORKS. So the
 * user is reaching the same SYMPTOM by a mechanism the upstream issue does not
 * describe. PR #896 is also still OPEN, not merged.
 *
 * Therefore this prompt:
 *   - links #895 as the known upstream report for this error string,
 *   - states that the cache wipe clears it,
 *   - states plainly that the underlying cause here is NOT established,
 *   - and recommends no version change at all.
 *
 * Getting this wrong sends the user chasing a fix that cannot apply to them.
 * {@link FORBIDDEN_CLAIMS} encodes the refusal so a future edit that reaches
 * for "upgrade to 1.67.0" fails the test suite instead of the user.
 */

import { CACHE_FILES, CEILING_KEY, CEILING_CURRENT_DEFAULT, CEILING_DEFAULT, CEILING_KEY_AS_REPORTED_UPSTREAM } from "./remedy";

/** The upstream report that matches this error string. */
export const ISSUE_URL = "https://github.com/rynfar/meridian/issues/895";

/** The still-open fix PR for the Windows mechanism. */
export const FIX_PR_URL = "https://github.com/rynfar/meridian/pull/896";

/** What the user can choose. */
export type Choice = "wipe" | "ceiling" | "decline";

/** One offered action. */
export interface PromptOption {
  readonly id: Choice;
  readonly label: string;
  readonly detail: string;
}

/** The whole dialog, rendered from facts. */
export interface Prompt {
  readonly title: string;
  readonly body: string;
  readonly options: readonly PromptOption[];
}

/** Inputs the dialog needs from the live system. */
export interface PromptFacts {
  /** Resolved unit id, or undefined when it could not be found. */
  readonly unit: string | undefined;
  /** Absolute paths of the two cache files. */
  readonly paths: readonly string[];
  /** How many sessions are currently parked on the latch. */
  readonly pausedSessions: number;
}

/**
 * Claims this prompt must never make. Asserted absent by the test suite.
 *
 * Each entry is a real failure mode, not a stylistic rule:
 * - upgrade advice: PR #896 is open and fixes a Windows-only path, so no
 *   released version is known to change anything here.
 * - root-cause assertions: the Linux mechanism is genuinely unknown.
 * - "fixed"/"solved" language about the ceiling: it defers, it does not solve.
 */
export const FORBIDDEN_CLAIMS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "upgrade advice", pattern: /\bupgrad/i },
  { name: "update-to-version advice", pattern: /\bupdate\s+(?:to|meridian)\b/i },
  { name: "fixed-in-version claim", pattern: /\bfixed\s+in\b/i },
  { name: "latest-version advice", pattern: /\blatest\s+version\b/i },
  { name: "root-cause assertion", pattern: /\b(?:the\s+)?root\s+cause\s+is\b/i },
  { name: "causal assertion", pattern: /\bis\s+caused\s+by\b/i },
  { name: "windows-mechanism-applies-here claim", pattern: /\bbecause\s+(?:of\s+)?(?:the\s+)?windows\b/i },
  { name: "permanent-fix claim for the ceiling", pattern: /\b(?:permanently|fully)\s+(?:fix|fixes|solve|solves)\b/i },
];

/** Render the dialog. Pure: same facts in, same text out. */
export function buildPrompt(facts: PromptFacts): Prompt {
  const [gcPath, sessionsPath] = facts.paths;
  const joined = facts.pausedSessions > 1
    ? `\n\n${facts.pausedSessions} sessions are paused on this error and are waiting for your answer. Answering once releases all of them.`
    : "";

  const serviceLine = facts.unit === undefined
    ? `\nI could NOT find the meridian service unit on this machine, so I cannot stop it, and I will not delete those files while it may still be running — meridian keeps them open and rewrites them, so a delete under a live daemon can simply be flushed back. Stop meridian yourself, delete the two files listed above, and start it again.`
    : `\nI can do this for you: stop \`${facts.unit}\`, delete both files, then start it again. The order matters — meridian rewrites both files continuously, so deleting them under a live daemon can be undone by the next flush.`;

  const body =
    `meridian rejected the model request with HTTP 500 \`api_error\`: "session transcript ownership backlog is full".\n` +
    `\n` +
    `meridian tracks one transcript-ownership record per forked session in its cache. When the number of records still pending garbage collection reaches its ceiling, it refuses new sessions with this error. Clearing the cache drops those records and lets requests through again.\n` +
    `\n` +
    `The two files holding that state are:\n` +
    `  - ${gcPath}\n` +
    `  - ${sessionsPath}\n` +
    serviceLine +
    `\n\n` +
    `Upstream: ${ISSUE_URL} is the known upstream report carrying this exact error string.\n` +
    `\n` +
    `What that issue does NOT tell us: it is filed as a Windows garbage-collection failure, and its fix PR (${FIX_PR_URL}, still open) describes a mechanism specific to Windows — session GC skipping a deletion path that assumes POSIX process groups. This machine is Linux, and that POSIX path is the one that works here. So this is the same symptom arriving by a route the upstream report does not describe. The cache wipe clears the symptom; why the backlog fills on this machine is not established, and no released meridian version is known to change it.` +
    joined;

  const options: PromptOption[] = [];

  if (facts.unit !== undefined) {
    options.push({
      id: "wipe",
      label: "Clear the backlog now",
      detail:
        `Stop ${facts.unit}, delete ${CACHE_FILES.join(" and ")}, then start it again, in that order. ` +
        `This clears the current backlog. It does not stop it from filling up again.`,
    });
    options.push({
      id: "ceiling",
      label: `Raise the ceiling (persistent, separate change)`,
      detail:
        `Add \`${CEILING_KEY}=${CEILING_DEFAULT}\` as a unit drop-in for ${facts.unit}, reload systemd, and restart it. ` +
        `meridian's built-in ceiling is ${CEILING_CURRENT_DEFAULT}. Raising it makes this error recur less often — it DEFERS the problem rather than resolving it, and the pending records stay on disk. ` +
        `Note: issue #895 writes this setting as \`${CEILING_KEY_AS_REPORTED_UPSTREAM}\`, but meridian only reads the \`MERIDIAN_\`-prefixed name, so the bare name would have no effect. ` +
        `This is offered on its own, not as part of the wipe; you can take it now or later.`,
    });
  }

  options.push({
    id: "decline",
    label: "No — let it fail normally",
    detail:
      "Nothing is changed. The pause is released immediately and every waiting session continues down its normal failure path.",
  });

  return {
    title: "meridian: session transcript backlog is full",
    body,
    options,
  };
}

/**
 * Check a rendered prompt against {@link FORBIDDEN_CLAIMS}.
 * @param prompt - the rendered dialog.
 * @returns the names of every claim the text makes that it must not.
 */
export function overclaims(prompt: Prompt): string[] {
  const text = `${prompt.title}\n${prompt.body}\n${prompt.options.map((o) => `${o.label}\n${o.detail}`).join("\n")}`;
  return FORBIDDEN_CLAIMS.filter((c) => c.pattern.test(text)).map((c) => c.name);
}
