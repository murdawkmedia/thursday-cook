/**
 * The tour step schema (ticket E14).
 *
 * A step is data, not code: display text, a CSS selector for its target, and
 * a completion condition. No step logic lives in prose.
 *
 * ERASABLE-SYNTAX ONLY. `scripts/generate-steps.mjs` imports this file (and
 * `./yaml`) straight from plain node, which strips types but does not
 * transform: no enums, no namespaces, no parameter properties, no imports
 * except `import type`. Break that and generation fails loudly.
 *
 * W6 COMPATIBILITY, by field name. W6's declarative wizards are the same
 * shape -- ordered steps, text, a target, a completion condition -- and the
 * names here are chosen to match: `text`, `target`, `done`. A tutorial is a
 * wizard whose steps happen in the UI rather than a terminal, so this panel
 * doubles as the GUI wizard renderer W6 needs instead of becoming a second
 * format. `chapter` is the wizard's group; `id` is the stable key both use.
 */

import type { TokenName } from "@trythursday/tokens";
import { parseSubsetYaml } from "./yaml";
import type { YamlValue } from "./yaml";

/**
 * Hard cap on a step's display text, in characters after trim.
 *
 * The number is defended, not tuned: the card is roughly 340px wide, so 500
 * characters are about 90 words or six lines at reading size -- an
 * instruction that fits without scrolling. A step needing more is carrying
 * the manual the tour must not become (E11's rule), so the format refuses to
 * hold it: overlong text is a schema error, enforced here and in tests, not
 * a rendering inconvenience. Pick a bigger number only with a card that
 * proves it fits.
 */
export const MAX_STEP_TEXT_CHARACTERS = 500;

/** Hard cap on the optional prefill text: one line the composer can hold. */
export const MAX_PREFILL_CHARACTERS = 200;

/** Hard cap on a target selector: selectors are anchors, not queries. */
export const MAX_TARGET_CHARACTERS = 200;

/** Step ids look like slot ids: lowercase, hyphenated, no surprises. */
export const STEP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * When a step counts as done. Evaluated against the observable world
 * (progress.ts), never against an agent's report:
 *
 * - `ticket-done`: the ticket really moved to `done` on the board.
 * - `file-exists`: the file really exists (the wizard was really written).
 * - `command-ran`: the command really ran (`/compact` really compacted).
 * - `manual`: purely informational -- nothing exists to detect, so the
 *   panel carries a Next button. The ONLY kind with one: offering Next on
 *   a detectable step would invite the user to claim what did not happen,
 *   which is the hole this design closes.
 */
export type StepCondition =
  | { readonly op: "ticket-done"; readonly ticket: string }
  | { readonly op: "file-exists"; readonly path: string }
  | { readonly op: "command-ran"; readonly command: string }
  | { readonly op: "manual" };

/** A single tour step, exactly as `data/steps.yaml` declares it. */
export interface TourStep {
  /** Stable key, `STEP_ID_PATTERN`, unique across the tour. */
  readonly id: string;
  /** 1-based chapter; non-decreasing down the list (the tour's order). */
  readonly chapter: number;
  /** The plan ticket this step teaches, or null when it frames the tour. */
  readonly ticket: string | null;
  /** Markdown shown in the card, 1..`MAX_STEP_TEXT_CHARACTERS` after trim. */
  readonly text: string;
  /**
   * CSS selector of the element to spotlight. It IS the W6 target: the
   * panel resolves it against the rendered DOM with one
   * `getBoundingClientRect`. A selector matching nothing is a defect --
   * loud in dev/tests, card-without-spotlight in prod -- never a no-op.
   */
  readonly target: string;
  /** The one teaching point, handed to the agent tool verbatim. */
  readonly teaching: string;
  /** What counts as done. */
  readonly done: StepCondition;
  /**
   * Optional composer prefill offered when the step becomes current: the
   * composer already holding the right thing to send. Offered only into
   * an empty composer, never over the user's words.
   */
  readonly prefill?: string;
}

/** A step advances itself when it has something to detect. */
export function isDetectStep(step: TourStep): boolean {
  return step.done.op !== "manual";
}

/** The completion condition as one human sentence (panel + tool share it). */
export function describeCondition(step: TourStep): string {
  const done = step.done;
  switch (done.op) {
    case "manual":
      return "Informational step: the user reads it and presses Next.";
    case "ticket-done":
      return `Ticket ${done.ticket} is in done state on the board.`;
    case "file-exists":
      return `File ${done.path} exists in the tour workspace.`;
    case "command-ran":
      return `Command ${done.command} ran in this session.`;
  }
}

/**
 * Validate a parsed step list against the schema plus the plan/step
 * single-source rule. Returns every violation found (empty means valid);
 * the host throws on a non-empty list, the tests assert per-rule.
 *
 * `planTickets` are the ticket ids parsed from the tour PLAN.md -- the
 * SAME ids the steps name. The plan's count and the step list cannot
 * disagree because both derive from that one source: every plan ticket
 * must own at least one step, and no step may name a ticket the plan
 * does not hold.
 */
export function validateSteps(
  steps: readonly TourStep[],
  planTickets: readonly string[],
): string[] {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("tour has no steps");

  const seen = new Set<string>();
  let previousChapter = 1;
  let first = true;

  for (const [index, step] of steps.entries()) {
    const where = `step ${index} (${step.id || "without id"})`;

    if (!STEP_ID_PATTERN.test(step.id)) {
      errors.push(`${where}: id "${step.id}" must match ${STEP_ID_PATTERN}`);
    }
    if (seen.has(step.id)) errors.push(`${where}: duplicate step id "${step.id}"`);
    seen.add(step.id);

    if (!Number.isInteger(step.chapter) || step.chapter < 1) {
      errors.push(`${where}: chapter must be a positive integer`);
    } else if (!first && step.chapter < previousChapter) {
      errors.push(`${where}: chapter goes backwards (${previousChapter} -> ${step.chapter})`);
    }
    if (Number.isInteger(step.chapter) && step.chapter >= 1) previousChapter = step.chapter;
    first = false;

    if (step.ticket !== null) {
      if (step.ticket.trim() === "") errors.push(`${where}: ticket is blank`);
      else if (!planTickets.includes(step.ticket)) {
        errors.push(
          `${where}: ticket "${step.ticket}" is not in the plan (${planTickets.join(", ")})`,
        );
      }
    }

    const text = step.text.trim();
    if (text.length === 0) errors.push(`${where}: text is empty`);
    if (text.length > MAX_STEP_TEXT_CHARACTERS) {
      errors.push(
        `${where}: text is ${text.length} chars, over the ${MAX_STEP_TEXT_CHARACTERS} cap -- ` +
          `shorten the step, not the limit`,
      );
    }

    const target = step.target.trim();
    if (target.length === 0) errors.push(`${where}: target selector is empty`);
    if (target.length > MAX_TARGET_CHARACTERS) {
      errors.push(
        `${where}: target selector is ${target.length} chars, over the ${MAX_TARGET_CHARACTERS} cap`,
      );
    }
    if (/[<>{}]/.test(target)) {
      errors.push(`${where}: target selector "${target}" contains markup characters`);
    }

    if (step.teaching.trim().length === 0) errors.push(`${where}: teaching point is empty`);

    const done = step.done;
    if (done.op === "ticket-done" && done.ticket.trim() === "") {
      errors.push(`${where}: ticket-done condition names no ticket`);
    } else if (done.op === "file-exists" && done.path.trim() === "") {
      errors.push(`${where}: file-exists condition names no path`);
    } else if (done.op === "command-ran" && done.command.trim() === "") {
      errors.push(`${where}: command-ran condition names no command`);
    } else if (
      done.op !== "ticket-done" &&
      done.op !== "file-exists" &&
      done.op !== "command-ran" &&
      done.op !== "manual"
    ) {
      errors.push(`${where}: unknown completion op "${(done as StepCondition).op}"`);
    }

    if (step.prefill !== undefined) {
      if (step.prefill.trim().length === 0) errors.push(`${where}: prefill is blank`);
      if (step.prefill.length > MAX_PREFILL_CHARACTERS) {
        errors.push(
          `${where}: prefill is ${step.prefill.length} chars, over the ${MAX_PREFILL_CHARACTERS} cap`,
        );
      }
    }
  }

  for (const ticket of planTickets) {
    if (!steps.some((step) => step.ticket === ticket)) {
      errors.push(`plan ticket "${ticket}" owns no step -- the step list and the plan disagree`);
    }
  }

  return errors;
}

/** Token names this plugin's stylesheet may reference (checked in tests). */
export const TOUR_TOKENS: readonly TokenName[] = [
  "background",
  "background-elevated",
  "foreground",
  "foreground-muted",
  "border",
  "border-strong",
  "accent",
  "error",
  "focus",
  "radius-container",
  "radius-control",
];

/** The parsed tour file: plan tickets plus the ordered steps. */
export interface TourFile {
  readonly tickets: readonly string[];
  readonly steps: readonly TourStep[];
}

/** Step keys exactly; an unknown key is a typo, not an extension. */
const STEP_KEYS: readonly string[] = [
  "id",
  "chapter",
  "ticket",
  "text",
  "target",
  "teaching",
  "done",
  "prefill",
];

function isRecord(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCondition(raw: YamlValue, where: string): StepCondition {
  if (!isRecord(raw)) throw new Error(`${where}: done must be a mapping`);
  const op = raw["op"];
  if (op === "manual") {
    if (Object.keys(raw).length !== 1) throw new Error(`${where}: manual takes no other keys`);
    return { op: "manual" };
  }
  if (op === "ticket-done") {
    if (typeof raw["ticket"] !== "string") throw new Error(`${where}: ticket-done needs a ticket`);
    if (Object.keys(raw).length !== 2)
      throw new Error(`${where}: ticket-done takes only op and ticket`);
    return { op: "ticket-done", ticket: raw["ticket"] };
  }
  if (op === "file-exists") {
    if (typeof raw["path"] !== "string") throw new Error(`${where}: file-exists needs a path`);
    if (Object.keys(raw).length !== 2)
      throw new Error(`${where}: file-exists takes only op and path`);
    return { op: "file-exists", path: raw["path"] };
  }
  if (op === "command-ran") {
    if (typeof raw["command"] !== "string")
      throw new Error(`${where}: command-ran needs a command`);
    if (Object.keys(raw).length !== 2)
      throw new Error(`${where}: command-ran takes only op and command`);
    return { op: "command-ran", command: raw["command"] };
  }
  throw new Error(`${where}: unknown completion op ${JSON.stringify(op)}`);
}

function parseStep(raw: YamlValue, index: number): TourStep {
  const where = `step ${index}`;
  if (!isRecord(raw)) throw new Error(`${where}: must be a mapping`);
  for (const key of Object.keys(raw)) {
    if (!STEP_KEYS.includes(key)) throw new Error(`${where}: unknown key "${key}"`);
  }
  const id = raw["id"];
  const chapter = raw["chapter"];
  const ticket = raw["ticket"];
  const text = raw["text"];
  const target = raw["target"];
  const teaching = raw["teaching"];
  const prefill = raw["prefill"];
  if (typeof id !== "string") throw new Error(`${where}: id must be a string`);
  if (typeof chapter !== "number") throw new Error(`${where}: chapter must be an integer`);
  if (ticket !== null && typeof ticket !== "string") {
    throw new Error(`${where}: ticket must be a ticket id or null`);
  }
  if (typeof text !== "string") throw new Error(`${where}: text must be a string`);
  if (typeof target !== "string") throw new Error(`${where}: target must be a string`);
  if (typeof teaching !== "string") throw new Error(`${where}: teaching must be a string`);
  if (prefill !== undefined && prefill !== null && typeof prefill !== "string") {
    throw new Error(`${where}: prefill must be a string when present`);
  }
  if (!isRecord(raw["done"])) throw new Error(`${where}: done must be a mapping`);
  const step: TourStep = {
    id,
    chapter,
    ticket,
    text,
    target,
    teaching,
    done: parseCondition(raw["done"], where),
    ...(typeof prefill === "string" ? { prefill } : {}),
  };
  return step;
}

/**
 * Parse `data/steps.yaml` into tickets plus steps. Shape errors throw with
 * the step index; schema errors (caps, ids, plan agreement) are
 * `validateSteps`' business, run next by the generator and the host.
 */
export function parseTourFile(text: string): TourFile {
  const doc = parseSubsetYaml(text);
  const tickets = doc["tickets"];
  const steps = doc["steps"];
  for (const key of Object.keys(doc)) {
    if (key !== "tickets" && key !== "steps")
      throw new Error(`tour file: unknown top-level key "${key}"`);
  }
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("tour file: tickets must be a non-empty sequence");
  }
  for (const [index, ticket] of tickets.entries()) {
    if (typeof ticket !== "string" || ticket.trim() === "") {
      throw new Error(`tour file: ticket ${index} must be a non-empty string`);
    }
  }
  if (!Array.isArray(steps)) throw new Error("tour file: steps must be a sequence");
  return {
    tickets: tickets as string[],
    steps: (steps as YamlValue[]).map((raw, index) => parseStep(raw, index)),
  };
}
