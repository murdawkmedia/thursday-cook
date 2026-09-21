/**
 * Derived completion and durable progress (ticket E14).
 *
 * COMPLETION IS DERIVED, NOT CLAIMED. `stepComplete` reads the observable
 * world -- tickets really done, files really present, commands really run --
 * and there is deliberately NO parameter for anyone's report: an agent
 * claim is not an input to this module at all, so no call shape can smuggle
 * one in. The negative test pins that (`@ts-expect-error` on a claim
 * event): adding a claim channel breaks the suite.
 *
 * The world arrives in three lists. The host fills them from real state:
 * `filesExist` from the filesystem (wired), `ticketsDone` from the board
 * and `commandsRan` from observed commands (explicit seams -- see host.ts
 * for what is wired and what is recorded for a future ticket).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { TourStep } from "./steps";

/** Everything a completion condition is allowed to read. Nothing else. */
export interface TourWorld {
  /** Ticket ids in `done` state on the board. */
  readonly ticketsDone: readonly string[];
  /** Tour-workspace-relative paths present on disk. */
  readonly filesExist: readonly string[];
  /** Commands observed to run, e.g. `"/compact"`. */
  readonly commandsRan: readonly string[];
}

/** The empty world: nothing has happened yet. */
export const EMPTY_WORLD: TourWorld = { ticketsDone: [], filesExist: [], commandsRan: [] };

/** A real event the host observed. Claims are not representable here. */
export type WorldEvent =
  | { readonly kind: "ticket-done"; readonly ticket: string }
  | { readonly kind: "file-exists"; readonly path: string }
  | { readonly kind: "command-ran"; readonly command: string };

/**
 * Whether the step's condition holds in this world. Pure, so the
 * claim-can't-advance property is a unit test over values.
 *
 * `manual` steps NEVER complete here: they are purely informational, and
 * only the user's Next press (advanceManual) moves them. Auto-completing
 * them would be the claim hole with a nicer name.
 */
export function stepComplete(step: TourStep, world: TourWorld): boolean {
  const done = step.done;
  switch (done.op) {
    case "manual":
      return false;
    case "ticket-done":
      return world.ticketsDone.includes(done.ticket);
    case "file-exists":
      return world.filesExist.includes(done.path);
    case "command-ran":
      return world.commandsRan.includes(done.command);
    default:
      throw new Error(
        `thursday-tour: unknown completion op ${JSON.stringify((done as { op?: unknown }).op)}`,
      );
  }
}

/** Fold one observed event into a world snapshot. Unknown kinds throw. */
export function applyWorldEvent(world: TourWorld, event: WorldEvent): TourWorld {
  switch (event.kind) {
    case "ticket-done":
      return world.ticketsDone.includes(event.ticket)
        ? world
        : { ...world, ticketsDone: [...world.ticketsDone, event.ticket] };
    case "file-exists":
      return world.filesExist.includes(event.path)
        ? world
        : { ...world, filesExist: [...world.filesExist, event.path] };
    case "command-ran":
      return world.commandsRan.includes(event.command)
        ? world
        : { ...world, commandsRan: [...world.commandsRan, event.command] };
    default:
      throw new Error(
        `thursday-tour: unknown world event kind ${JSON.stringify((event as { kind?: unknown }).kind)}`,
      );
  }
}

/** The client's last prefill attempt, recorded host-side either way. */
export interface PrefillReport {
  readonly ok: boolean;
  /** Which surface took the text: `conversation-service` | `composer-dom` | `none`. */
  readonly method: string;
  readonly detail: string;
}

/** Durable tour state. Versioned so a future shape can migrate, not crash. */
export interface TourProgress {
  readonly version: 1;
  /** Current step id, or null before start / after finish. */
  readonly currentStepId: string | null;
  /** The user exited: the panel stays away until they return. */
  readonly exited: boolean;
  readonly skipped: readonly string[];
  readonly done: readonly string[];
  readonly prefillReport: PrefillReport | null;
  readonly updatedAt: string;
}

export function freshProgress(): TourProgress {
  return {
    version: 1,
    currentStepId: null,
    exited: false,
    skipped: [],
    done: [],
    prefillReport: null,
    updatedAt: new Date().toISOString(),
  };
}

function stamp(progress: TourProgress): TourProgress {
  return { ...progress, updatedAt: new Date().toISOString() };
}

/**
 * The progress file. It lives OUTSIDE session state -- on disk, next to
 * the tour workspace, never in the transcript -- which is why `/compact`
 * cannot destroy it: compaction rewrites the session, and this file is
 * not in the session. Resume and restart re-read the same path.
 */
export class TourProgressStore {
  constructor(private readonly file: string) {}

  /** Load, or fresh state when the file is missing or unreadable. */
  load(): TourProgress {
    try {
      const raw = readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<TourProgress>;
      if (parsed.version !== 1 || !Array.isArray(parsed.done) || !Array.isArray(parsed.skipped)) {
        return freshProgress();
      }
      return {
        version: 1,
        currentStepId: typeof parsed.currentStepId === "string" ? parsed.currentStepId : null,
        exited: parsed.exited === true,
        skipped: parsed.skipped.filter((id): id is string => typeof id === "string"),
        done: parsed.done.filter((id): id is string => typeof id === "string"),
        prefillReport: parsed.prefillReport ?? null,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch {
      return freshProgress();
    }
  }

  save(progress: TourProgress): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(progress, null, 2) + "\n");
  }

  /**
   * Record one observed event: every detect step whose condition now holds
   * moves to done. Returns the saved progress. Manual steps are untouched
   * -- only `advanceManual` moves them.
   */
  record(event: WorldEvent, steps: readonly TourStep[]): TourProgress {
    const progress = this.load();
    const world = recordIntoWorld(progress, steps, event);
    const done = new Set(progress.done);
    for (const step of steps) {
      if (step.done.op !== "manual" && stepComplete(step, world) && !done.has(step.id)) {
        done.add(step.id);
      }
    }
    const next = stamp({
      ...progress,
      done: [...done],
      currentStepId: currentId(steps, [...done], progress.skipped),
    });
    this.save(next);
    return next;
  }

  /**
   * The Next button on a `manual` step. Refuses detect steps: they advance
   * themselves when the thing happens, and a Next on one would be a claim
   * button. Refuses unknown ids.
   */
  advanceManual(stepId: string, steps: readonly TourStep[]): TourProgress {
    const step = steps.find((candidate) => candidate.id === stepId);
    if (step === undefined) throw new Error(`thursday-tour: unknown step "${stepId}"`);
    if (step.done.op !== "manual") {
      throw new Error(`thursday-tour: step "${stepId}" completes by detection, not by Next`);
    }
    const progress = this.load();
    const done = progress.done.includes(stepId) ? progress.done : [...progress.done, stepId];
    const next = stamp({
      ...progress,
      done,
      currentStepId: currentId(steps, done, progress.skipped),
    });
    this.save(next);
    return next;
  }

  /** Skip this step: every step carries a way out, detect or manual. */
  skip(stepId: string, steps: readonly TourStep[]): TourProgress {
    if (!steps.some((step) => step.id === stepId))
      throw new Error(`thursday-tour: unknown step "${stepId}"`);
    const progress = this.load();
    const skipped = progress.skipped.includes(stepId)
      ? progress.skipped
      : [...progress.skipped, stepId];
    const next = stamp({
      ...progress,
      skipped,
      currentStepId: currentId(steps, progress.done, skipped),
    });
    this.save(next);
    return next;
  }

  /** Exit the tour: the panel stands down until the user returns. */
  exit(): TourProgress {
    const next = stamp({ ...this.load(), exited: true });
    this.save(next);
    return next;
  }

  /** Re-enter after an exit. */
  reenter(steps: readonly TourStep[]): TourProgress {
    const progress = this.load();
    const next = stamp({
      ...progress,
      exited: false,
      currentStepId: currentId(steps, progress.done, progress.skipped),
    });
    this.save(next);
    return next;
  }

  reportPrefill(report: PrefillReport): TourProgress {
    const next = stamp({ ...this.load(), prefillReport: report });
    this.save(next);
    return next;
  }

  /** The step the panel and the tool should show, or null when finished. */
  current(steps: readonly TourStep[]): TourStep | null {
    const progress = this.load();
    if (progress.exited) return null;
    const id = currentId(steps, progress.done, progress.skipped) ?? progress.currentStepId;
    return steps.find((step) => step.id === id && !progress.done.includes(step.id)) ?? null;
  }
}

function currentId(
  steps: readonly TourStep[],
  done: readonly string[],
  skipped: readonly string[],
): string | null {
  const open = steps.find((step) => !done.includes(step.id) && !skipped.includes(step.id));
  return open?.id ?? null;
}

/**
 * Rebuild the event-derived half of the world from stored progress plus
 * the new event. The store persists step outcomes, not raw observations,
 * so resume re-derives cleanly and a stale observation can never unmark
 * a finished step.
 */
function recordIntoWorld(
  progress: TourProgress,
  steps: readonly TourStep[],
  event: WorldEvent,
): TourWorld {
  let world: TourWorld = { ...EMPTY_WORLD };
  for (const step of steps) {
    if (!progress.done.includes(step.id)) continue;
    if (step.done.op === "ticket-done")
      world = applyWorldEvent(world, { kind: "ticket-done", ticket: step.done.ticket });
    else if (step.done.op === "file-exists")
      world = applyWorldEvent(world, { kind: "file-exists", path: step.done.path });
    else if (step.done.op === "command-ran") {
      world = applyWorldEvent(world, { kind: "command-ran", command: step.done.command });
    }
  }
  return applyWorldEvent(world, event);
}

/** True when the file backing this store exists (tests, diagnostics). */
export function progressFileExists(file: string): boolean {
  return existsSync(file);
}
