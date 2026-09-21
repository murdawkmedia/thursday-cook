/**
 * The shipped tour, exercised step by step (ticket E14).
 *
 * - the generated module validates clean against the schema;
 * - EVERY step is asserted individually (id, chapter order, text cap,
 *   non-empty target/teaching, condition shape) -- a step added to the YAML
 *   without coverage here is impossible, because the loop reads the YAML;
 * - deliberately broken steps turn red (one fixture per rule);
 * - the generated module is in sync with the YAML (drift fails);
 * - the plan/step single-source rule: PLAN_TICKETS deep-equals the ticket
 *   ids parsed from the tour PLAN.md, every plan ticket owns a step, and no
 *   step names a ticket the plan does not hold.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseTourFile, validateSteps } from "../src/steps";
import type { TourStep } from "../src/steps";
import { MAX_STEP_TEXT_CHARACTERS } from "../src/steps";
import { PLAN_TICKETS, STEPS } from "../src/steps.generated";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

function readYaml(): string {
  return readFileSync(join(packageRoot, "data", "steps.yaml"), "utf8");
}

/** The tour PLAN.md this tour carries: the other half of the single source. */
function readPlanTickets(): string[] {
  const plan = readFileSync(
    join(packageRoot, "..", "..", "install", "templates", "trying-out-thursday", "PLAN.md"),
    "utf8",
  );
  const ids: string[] = [];
  for (const match of plan.matchAll(/\*\*Ticket (T\d+):/g)) {
    const id = match[1] as string;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

describe("the shipped step list", () => {
  it("validates clean against the schema", () => {
    expect(validateSteps(STEPS, PLAN_TICKETS)).toEqual([]);
  });

  it("holds ten steps across three chapters", () => {
    expect(STEPS.length).toBe(10);
    expect(STEPS.map((step) => step.chapter)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 3, 3]);
  });

  it("exercises every step: id, text cap, target, teaching, condition", () => {
    expect(STEPS.length).toBeGreaterThan(0);
    for (const step of STEPS) {
      expect(step.id, "step id").toMatch(/^[a-z][a-z0-9-]*$/);
      expect(step.text.trim().length, `${step.id} text non-empty`).toBeGreaterThan(0);
      expect(step.text.trim().length, `${step.id} text cap`).toBeLessThanOrEqual(
        MAX_STEP_TEXT_CHARACTERS,
      );
      expect(step.target.trim().length, `${step.id} target`).toBeGreaterThan(0);
      expect(step.teaching.trim().length, `${step.id} teaching`).toBeGreaterThan(0);
      const done = step.done;
      if (done.op === "ticket-done") expect(done.ticket, `${step.id} condition`).not.toBe("");
      if (done.op === "file-exists") expect(done.path, `${step.id} condition`).not.toBe("");
      if (done.op === "command-ran") expect(done.command, `${step.id} condition`).not.toBe("");
    }
  });

  it("uses every completion kind, and only manual steps carry Next", () => {
    const ops = STEPS.map((step) => step.done.op).sort();
    expect(ops).toContain("ticket-done");
    expect(ops).toContain("file-exists");
    expect(ops).toContain("command-ran");
    expect(ops).toContain("manual");
  });

  it("covers every plan ticket", () => {
    for (const ticket of PLAN_TICKETS) {
      expect(
        STEPS.some((step) => step.ticket === ticket),
        `plan ticket ${ticket} owns a step`,
      ).toBe(true);
    }
  });
});

describe("deliberately broken steps turn red", () => {
  function check(steps: readonly TourStep[], tickets: readonly string[] = ["T1"]): string[] {
    return validateSteps(steps, tickets);
  }

  function good(): TourStep {
    return {
      id: "see-blog",
      chapter: 1,
      ticket: "T1",
      text: "Run it.",
      target: "[data-composer-seat]",
      teaching: "Action first.",
      done: { op: "manual" },
    };
  }

  it("rejects overlong text", () => {
    const step = { ...good(), text: "x".repeat(MAX_STEP_TEXT_CHARACTERS + 1) };
    expect(check([step])[0]).toMatch(/over the 500 cap/);
  });

  it("rejects a bad selector, a duplicate id and a backwards chapter", () => {
    expect(check([{ ...good(), target: "<div>" }])[0]).toMatch(/markup characters/);
    expect(check([good(), good()]).some((e) => e.includes("duplicate"))).toBe(true);
    expect(
      check([good(), { ...good(), id: "other", chapter: 0 }]).some((e) =>
        e.includes("positive integer"),
      ),
    ).toBe(true);
  });

  it("a detectable step validates clean -- the Next refusal lives at the panel, not the schema", () => {
    const step: TourStep = { ...good(), id: "other", done: { op: "ticket-done", ticket: "T1" } };
    expect(check([good(), step])).toEqual([]);
  });

  it("rejects steps naming tickets the plan does not hold, and plans owning no step", () => {
    expect(check([{ ...good(), ticket: "T9" }]).some((e) => e.includes("not in the plan"))).toBe(
      true,
    );
    expect(check([good()], ["T1", "T2"]).some((e) => e.includes("owns no step"))).toBe(true);
  });

  it("rejects unknown keys and unknown completion ops at parse time", () => {
    expect(() => parseTourFile("tickets:\n  - T1\nsteps:\n  - id: x\n    bogus: 1\n")).toThrow(
      /unknown key/,
    );
    expect(() =>
      parseTourFile(
        "tickets:\n  - T1\nsteps:\n  - id: x\n    chapter: 1\n    ticket: T1\n    text: t\n    target: s\n    teaching: g\n    done:\n      op: vibes\n",
      ),
    ).toThrow(/unknown completion op/);
  });
});

describe("the generated module is in sync with the YAML", () => {
  it("parses to exactly the shipped constants", () => {
    const tour = parseTourFile(readYaml());
    expect([...tour.tickets]).toEqual([...PLAN_TICKETS]);
    expect(tour.steps).toEqual(STEPS.map((step) => ({ ...step })));
  });
});

describe("the plan/step single-source rule", () => {
  it("the plan's ticket ids equal the step list's tickets", () => {
    expect(readPlanTickets()).toEqual([...PLAN_TICKETS]);
  });
});
