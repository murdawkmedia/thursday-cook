/**
 * The agent lookup tool: the current step, its target, its teaching point
 * and its completion condition in one call (ticket E14).
 */

import { describe, expect, it } from "vitest";

import { STEPS } from "../src/steps.generated";
import { describeCondition } from "../src/steps";
import { EMPTY_WORLD, freshProgress } from "../src/progress";
import type { TourProgress } from "../src/progress";
import { TOUR_STATUS_TOOL_DESCRIPTION, TOUR_STATUS_TOOL_NAME, tourStatus } from "../src/tool";

describe("tour identity", () => {
  it("is named tour_status and describes the lookup", () => {
    expect(TOUR_STATUS_TOOL_NAME).toBe("tour_status");
    expect(TOUR_STATUS_TOOL_DESCRIPTION).toMatch(/current step/);
  });
});

describe("describeCondition", () => {
  it("says what counts as done, never who says so", () => {
    const byId = (id: string) => STEPS.find((step) => step.id === id);
    expect(describeCondition(byId("verify-t1")!)).toBe("Ticket T1 is in done state on the board.");
    expect(describeCondition(byId("build-wizard")!)).toBe(
      "File wizards/new-post.mjs exists in the tour workspace.",
    );
    expect(describeCondition(byId("run-compact")!)).toBe("Command /compact ran in this session.");
    expect(describeCondition(byId("see-blog")!)).toMatch(/presses Next/);
  });
});

describe("tourStatus", () => {
  it("returns the current step with target, teaching point and condition", () => {
    const result = tourStatus(STEPS, EMPTY_WORLD, freshProgress());
    expect(result.status).toBe("active");
    expect(result.position).toBe(1);
    expect(result.total).toBe(STEPS.length);
    expect(result.stepId).toBe("see-blog");
    expect(result.target).toBe("[data-composer-seat]");
    expect(result.teaching).toBe(
      "Action before explanation: the server command is the first message.",
    );
    expect(result.done).toMatch(/presses Next/);
    expect(result.detect).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("moves with progress and reports detection state", () => {
    const progress: TourProgress = {
      ...freshProgress(),
      done: ["see-blog", "state-intent", "signoff-t1"],
    };
    const open = tourStatus(STEPS, EMPTY_WORLD, progress);
    expect(open.stepId).toBe("verify-t1");
    expect(open.detect).toBe(true);
    expect(open.complete).toBe(false);

    const closed = tourStatus(STEPS, { ...EMPTY_WORLD, ticketsDone: ["T1"] }, progress);
    expect(closed.stepId).toBe("verify-t1");
    expect(closed.complete).toBe(true);
  });

  it("reports finished when every step is done or skipped, exited on exit", () => {
    const all = STEPS.map((step) => step.id);
    const finished = tourStatus(STEPS, EMPTY_WORLD, { ...freshProgress(), done: all });
    expect(finished.status).toBe("finished");
    expect(finished.stepId).toBeNull();

    const exited = tourStatus(STEPS, EMPTY_WORLD, { ...freshProgress(), exited: true });
    expect(exited.status).toBe("exited");
    expect(exited.stepId).toBeNull();
  });
});
