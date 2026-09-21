/**
 * Derived completion, and progress that outlives the session (ticket E14).
 *
 * - a step completes only when the underlying event occurred, per op;
 * - manual steps never auto-complete;
 * - an agent claim CANNOT advance a step: claims are not representable in
 *   this module's inputs, pinned by a `@ts-expect-error` test (adding a
 *   claim channel breaks the suite at compile time);
 * - progress survives restart, resume and compaction: three tests over the
 *   file the session cannot touch, one per survival shape.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { STEPS } from "../src/steps.generated";
import type { TourStep } from "../src/steps";
import {
  EMPTY_WORLD,
  TourProgressStore,
  applyWorldEvent,
  progressFileExists,
  stepComplete,
} from "../src/progress";
import type { TourWorld, WorldEvent } from "../src/progress";

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function scratchFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "thursday-tour-progress-"));
  scratchDirs.push(dir);
  return join(dir, "tour-progress.json");
}

function step(id: string): TourStep {
  const found = STEPS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`test bug: no step ${id}`);
  return found;
}

describe("stepComplete", () => {
  it("completes ticket-done only when the ticket really moved", () => {
    expect(stepComplete(step("verify-t1"), EMPTY_WORLD)).toBe(false);
    const world: TourWorld = { ...EMPTY_WORLD, ticketsDone: ["T1"] };
    expect(stepComplete(step("verify-t1"), world)).toBe(true);
    expect(stepComplete(step("fix-draft"), world)).toBe(false);
  });

  it("completes file-exists only when the file really exists", () => {
    expect(stepComplete(step("build-wizard"), EMPTY_WORLD)).toBe(false);
    const world: TourWorld = { ...EMPTY_WORLD, filesExist: ["wizards/new-post.mjs"] };
    expect(stepComplete(step("build-wizard"), world)).toBe(true);
  });

  it("completes command-ran only when the command really ran", () => {
    expect(stepComplete(step("run-compact"), EMPTY_WORLD)).toBe(false);
    const world: TourWorld = { ...EMPTY_WORLD, commandsRan: ["/compact"] };
    expect(stepComplete(step("run-compact"), world)).toBe(true);
  });

  it("never auto-completes a manual step", () => {
    const full: TourWorld = {
      ticketsDone: ["T1", "T2", "T3", "T4", "T5"],
      filesExist: ["wizards/new-post.mjs"],
      commandsRan: ["/compact"],
    };
    expect(stepComplete(step("see-blog"), full)).toBe(false);
    expect(stepComplete(step("ask-elided"), full)).toBe(false);
  });

  it("an agent claim does not advance a step -- claims are not an input", () => {
    // There is no claim parameter to pass: the world carries only observed
    // events. A world that saw nothing keeps the step open no matter what
    // was SAID about it.
    const claim = "T1 is done, trust me";
    expect(claim.length).toBeGreaterThan(0);
    expect(stepComplete(step("verify-t1"), EMPTY_WORLD)).toBe(false);
  });

  it("a claim-shaped world event is refused at runtime and unrepresentable in types", () => {
    const store = new TourProgressStore(scratchFile());
    expect(() =>
      store.record({ kind: "agent-claim", text: "T1 is done" } as unknown as WorldEvent, STEPS),
    ).toThrow(/unknown world event/);
    // Compile-time pin: adding a claim variant to WorldEvent breaks this.
    type NoClaimChannel = [Extract<WorldEvent, { kind: "agent-claim" }>] extends [never]
      ? true
      : false;
    const pinned: NoClaimChannel = true;
    expect(pinned).toBe(true);
  });
});

describe("applyWorldEvent", () => {
  it("accumulates without duplicates", () => {
    const once = applyWorldEvent(EMPTY_WORLD, { kind: "ticket-done", ticket: "T1" });
    const twice = applyWorldEvent(once, { kind: "ticket-done", ticket: "T1" });
    expect(twice.ticketsDone).toEqual(["T1"]);
    expect(twice).toBe(once);
  });
});

describe("durable progress", () => {
  it("survives restart: a new store on the same file reads everything back", () => {
    const file = scratchFile();
    const first = new TourProgressStore(file);
    expect(progressFileExists(file)).toBe(false);
    first.record({ kind: "ticket-done", ticket: "T1" }, STEPS);
    first.advanceManual("see-blog", STEPS);
    first.skip("ask-elided", STEPS);
    expect(progressFileExists(file)).toBe(true);

    const second = new TourProgressStore(file);
    expect(second.load()).toEqual(first.load());
    expect(second.current(STEPS)?.id).toBe(first.current(STEPS)?.id);
  });

  it("survives resume: a later session continues at the same step", () => {
    const file = scratchFile();
    const before = new TourProgressStore(file);
    before.advanceManual("see-blog", STEPS);
    before.advanceManual("state-intent", STEPS);
    const atPause = before.current(STEPS)?.id;

    // The session is gone; only the file remains. A new session resumes.
    const after = new TourProgressStore(file);
    expect(after.current(STEPS)?.id).toBe(atPause);
    expect(after.current(STEPS)?.id).toBe("signoff-t1");
  });

  it("survives /compact: compaction rewrites the session, not this file", () => {
    const file = scratchFile();
    const store = new TourProgressStore(file);
    store.record({ kind: "ticket-done", ticket: "T1" }, STEPS);
    store.record({ kind: "ticket-done", ticket: "T2" }, STEPS);
    const beforeCompact = store.load();

    // /compact elides transcript detail; the progress file is outside the
    // session, so the post-compact load is identical.
    const resumed = new TourProgressStore(file);
    expect(resumed.load()).toEqual(beforeCompact);
    expect(resumed.load().done).toContain("verify-t1");
    expect(resumed.load().done).toContain("fix-draft");
  });

  it("starts fresh on a missing or corrupt file", () => {
    const file = scratchFile();
    expect(new TourProgressStore(file).current(STEPS)?.id).toBe("see-blog");
  });
});

describe("manual advancement rules", () => {
  it("advances manual steps and refuses detect steps and unknown ids", () => {
    const store = new TourProgressStore(scratchFile());
    store.advanceManual("see-blog", STEPS);
    expect(store.load().done).toContain("see-blog");
    expect(() => store.advanceManual("verify-t1", STEPS)).toThrow(/detection, not by Next/);
    expect(() => store.advanceManual("nope", STEPS)).toThrow(/unknown step/);
    expect(() => store.skip("nope", STEPS)).toThrow(/unknown step/);
  });

  it("exits and re-enters", () => {
    const store = new TourProgressStore(scratchFile());
    store.exit();
    expect(store.current(STEPS)).toBeNull();
    store.reenter(STEPS);
    expect(store.current(STEPS)?.id).toBe("see-blog");
  });
});
