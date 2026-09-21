/**
 * The `tour_status` agent tool (ticket E14).
 *
 * Thursday's agent is deliberately cheap, and a markdown script asks it to
 * hold a long document in context and track its position across a long
 * session -- a memory-and-judgment task, which compaction actively attacks.
 * This tool turns following the tour into an enumerated lookup: the current
 * step, its target, its teaching point and what counts as done, in one
 * call. No dsh imports here: `src/host.ts` registers the definition with
 * `defineTool`; everything testable lives in this module.
 */

import type { TourProgress } from "./progress";
import { stepComplete } from "./progress";
import type { TourWorld } from "./progress";
import type { TourStep } from "./steps";
import { describeCondition, isDetectStep } from "./steps";

/** The tool name the agent calls. */
export const TOUR_STATUS_TOOL_NAME = "tour_status";

export const TOUR_STATUS_TOOL_DESCRIPTION =
  "Where the Teach-Me-Thursday tour stands. Returns the current step, its target selector, " +
  "its teaching point and what counts as done, so following the tour is a lookup, not a memory task. " +
  "Call it whenever the user works through the tour instead of re-reading the tour material.";

/** One tool call's canonical value. */
export interface TourStatusResult {
  /** `active` | `finished` (every step done or skipped) | `exited`. */
  readonly status: "active" | "finished" | "exited";
  readonly position: number;
  readonly total: number;
  readonly stepId: string | null;
  readonly chapter: number | null;
  readonly ticket: string | null;
  /** The markdown the panel shows, when there is a current step. */
  readonly text: string | null;
  /** CSS selector of the spotlighted element. */
  readonly target: string | null;
  /** The one teaching point of this step. */
  readonly teaching: string | null;
  /** Human sentence for what counts as done (never "the agent says so"). */
  readonly done: string | null;
  /** True when the step advances itself on detection (no Next button). */
  readonly detect: boolean;
  /** Whether the current step's condition already holds. */
  readonly complete: boolean;
}

/**
 * Answer the tool: the current step plus everything the agent needs to
 * teach it, looked up from stored progress -- not from the transcript,
 * which is exactly what compaction eats.
 */
export function tourStatus(
  steps: readonly TourStep[],
  world: TourWorld,
  progress: TourProgress,
): TourStatusResult {
  const total = steps.length;
  const open = steps.filter(
    (step) => !progress.done.includes(step.id) && !progress.skipped.includes(step.id),
  );
  if (progress.exited) {
    return {
      status: "exited",
      position: total - open.length,
      total,
      stepId: null,
      chapter: null,
      ticket: null,
      text: null,
      target: null,
      teaching: null,
      done: null,
      detect: false,
      complete: false,
    };
  }
  const current = open[0];
  if (current === undefined) {
    return {
      status: "finished",
      position: total,
      total,
      stepId: null,
      chapter: null,
      ticket: null,
      text: null,
      target: null,
      teaching: null,
      done: null,
      detect: false,
      complete: true,
    };
  }
  return {
    status: "active",
    position: total - open.length + 1,
    total,
    stepId: current.id,
    chapter: current.chapter,
    ticket: current.ticket,
    text: current.text,
    target: current.target,
    teaching: current.teaching,
    done: describeCondition(current),
    detect: isDetectStep(current),
    complete: stepComplete(current, world),
  };
}
