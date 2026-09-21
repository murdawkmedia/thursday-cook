/**
 * Thursday Tour (host half): the step list, derived completion, durable
 * progress and the agent lookup tool.
 *
 * WHAT RUNS WHERE. The host owns everything the browser cannot: the
 * validated step list, the progress file, the filesystem observations and
 * the `tour_status` tool. It does NOT serve client RPC in this version --
 * no bundled-plugin client→host transport is verified in this dsh release,
 * and shipping calls against an imagined one would be concealed machinery.
 * The client renders from the same generated steps and degrades to local
 * progress; the tool reads the durable store. (README: known limitation.)
 *
 * WHAT IS WIRED, EXACTLY:
 * - `file-exists`: polled from the filesystem against the tour workspace.
 * - `command-ran`: observed on the `tools/result` event by tool name
 *   (`/compact` matches the `compact` tool and vice versa -- a documented
 *   normalization, not a guess about which tools exist).
 * - `ticket-done`: an explicit seam (`queryTicketsDone`). No product board
 *   service exists in this workspace to observe (packages/aidos is a
 *   README), so until one lands the provider is composition-supplied and
 *   ticket conditions stay open. That gap is stated, not hidden.
 *
 * LOUD MOUNT: a bad tour workspace, an escaping file path, or a step list
 * that fails its own schema throws in `apply` -- a tour that cannot start
 * must not mount half-working.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

import { defineTool } from "@deepseek-ai/dsh-tools";

import { applyWorldEvent, EMPTY_WORLD, TourProgressStore } from "./progress";
import type { TourWorld } from "./progress";
import { PLAN_TICKETS, STEPS } from "./steps.generated";
import { validateSteps } from "./steps";
import type { TourStep } from "./steps";
import { TOUR_STATUS_TOOL_DESCRIPTION, TOUR_STATUS_TOOL_NAME, tourStatus } from "./tool";

/** The plugin's name, used in errors, the tool card and effect labels. */
export const PLUGIN_NAME = "thursday-tour";

/**
 * Cordis service dependencies. `tools` is ambient on the context --
 * dsh-tool-web calls `ctx.tools.register` with no injection, and the host
 * sandbox lists `ctx.tools.register` as a ctx verb -- so, like
 * thursday-skin's empty list, nothing is declared here.
 */
export const inject: string[] = [];

/** The plugin name Cordis displays. */
export const name = PLUGIN_NAME;

/** Composition-time configuration. */
export interface TourHostConfig {
  /** Absolute directory holding the tour workspace (trying-out-thursday). */
  readonly tourWorkspace: string;
  /** Progress file. Defaults to `~/.thursday/tour-progress.json`. */
  readonly progressFile?: string;
  /** Filesystem poll cadence in ms. Defaults to 2000. */
  readonly pollMs?: number;
  /**
   * Board observation seam: ticket ids currently in `done` state. Absent
   * means ticket conditions stay open (stated above, not hidden).
   */
  readonly queryTicketsDone?: () => readonly string[] | Promise<readonly string[]>;
}

/** The slice of the tools service this plugin uses, typed structurally. */
export interface TourToolsService {
  register(definition: unknown): () => void;
}

export interface TourHostContext {
  effect?: (setup: () => () => void, label?: string) => unknown;
  on?: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  tools: TourToolsService;
}

/** Default progress location: beside Thursday's home, never in a session. */
export function defaultProgressFile(): string {
  return join(homedir(), ".thursday", "tour-progress.json");
}

/**
 * Resolve a step's tour-workspace-relative path, refusing escapes. A path
 * that leaves the workspace is a composition defect: null, and `apply`
 * throws on it rather than watching a stranger's file.
 */
export function resolveTourPath(workspace: string, rel: string): string | null {
  const root = resolve(workspace);
  const target = resolve(join(root, rel));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/**
 * Whether a waited command matches the tool that just ran. Slash commands
 * and tool names are one namespace with two spellings: `/compact` is what
 * the user typed, `compact` is what the registry observed.
 */
export function commandMatchesTool(command: string, toolName: string): boolean {
  const canon = (value: string): string => (value.startsWith("/") ? value.slice(1) : value);
  return canon(command) === canon(toolName);
}

/** Every `file-exists` path the tour waits on. */
export function watchedFiles(steps: readonly TourStep[]): string[] {
  const paths: string[] = [];
  for (const step of steps) {
    if (step.done.op === "file-exists" && !paths.includes(step.done.path))
      paths.push(step.done.path);
  }
  return paths;
}

/** Every `command-ran` command the tour waits on. */
export function watchedCommands(steps: readonly TourStep[]): string[] {
  const commands: string[] = [];
  for (const step of steps) {
    if (step.done.op === "command-ran" && !commands.includes(step.done.command))
      commands.push(step.done.command);
  }
  return commands;
}

/** Render one tool call's canonical value as model-facing text. */
export function renderTourStatusText(value: {
  readonly status?: unknown;
  readonly position?: unknown;
  readonly total?: unknown;
  readonly stepId?: unknown;
  readonly text?: unknown;
  readonly target?: unknown;
  readonly teaching?: unknown;
  readonly done?: unknown;
}): string {
  if (value.status === "finished")
    return "The Teach-Me-Thursday tour is finished: every step is done or skipped.";
  if (value.status === "exited") return "The Teach-Me-Thursday tour is exited: the user left it.";
  const lines = [
    `Tour step ${String(value.position ?? "?")} of ${String(value.total ?? "?")}: ${String(value.stepId ?? "?")}`,
    "",
    String(value.text ?? ""),
    "",
    `Target: ${String(value.target ?? "?")}`,
    `Teaching point: ${String(value.teaching ?? "?")}`,
    `Done when: ${String(value.done ?? "?")}`,
  ];
  return lines.join("\n");
}

/** The tool's canonical value: required fields plus whatever the state has. */
export interface CanonicalTourStatus {
  readonly status: string;
  readonly position: number;
  readonly total: number;
  readonly detect: boolean;
  readonly complete: boolean;
  readonly stepId?: string;
  readonly chapter?: number;
  readonly ticket?: string;
  readonly text?: string;
  readonly target?: string;
  readonly teaching?: string;
  readonly done?: string;
}

/** Drop nulls: the canonical value carries only what the current state has. */
export function canonicalTourStatus(result: ReturnType<typeof tourStatus>): CanonicalTourStatus {
  const out: CanonicalTourStatus = {
    status: result.status,
    position: result.position,
    total: result.total,
    detect: result.detect,
    complete: result.complete,
  };
  const withStep: CanonicalTourStatus = {
    ...out,
    ...(result.stepId !== null ? { stepId: result.stepId } : {}),
    ...(result.chapter !== null ? { chapter: result.chapter } : {}),
    ...(result.ticket !== null ? { ticket: result.ticket } : {}),
    ...(result.text !== null ? { text: result.text } : {}),
    ...(result.target !== null ? { target: result.target } : {}),
    ...(result.teaching !== null ? { teaching: result.teaching } : {}),
    ...(result.done !== null ? { done: result.done } : {}),
  };
  return withStep;
}

/**
 * Cordis entry point. Validates the composition and the step list, registers
 * `tour_status`, and starts filesystem polling plus tool observation. Every
 * side effect is fiber-owned through `ctx.effect` (or the `dispose`
 * fallback), like thursday-mark.
 */
export function apply(ctx: TourHostContext, config: TourHostConfig): void {
  const errors = validateSteps(STEPS, PLAN_TICKETS);
  if (errors.length > 0) {
    throw new Error(
      `${PLUGIN_NAME}: the shipped step list is invalid:\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
  if (config.tourWorkspace.trim() === "" || !existsSync(config.tourWorkspace)) {
    throw new Error(`${PLUGIN_NAME}: tourWorkspace "${config.tourWorkspace}" does not exist`);
  }
  const workspace = resolve(config.tourWorkspace);
  for (const path of watchedFiles(STEPS)) {
    if (resolveTourPath(workspace, path) === null) {
      throw new Error(`${PLUGIN_NAME}: step watches "${path}", which escapes the tour workspace`);
    }
  }
  if (ctx.tools === undefined || typeof ctx.tools.register !== "function") {
    throw new Error(`${PLUGIN_NAME}: the host context offers no tools registry`);
  }

  const store = new TourProgressStore(config.progressFile ?? defaultProgressFile());
  const pollMs = config.pollMs ?? 2000;
  const queryTicketsDone = config.queryTicketsDone;

  /** Snapshot the observable world right now (tickets via the seam). */
  async function currentWorld(recordedCommands: readonly string[]): Promise<TourWorld> {
    let world: TourWorld = { ...EMPTY_WORLD };
    for (const path of watchedFiles(STEPS)) {
      const absolute = resolveTourPath(workspace, path) as string;
      if (existsSync(absolute)) world = applyWorldEvent(world, { kind: "file-exists", path });
    }
    for (const command of recordedCommands) {
      world = applyWorldEvent(world, { kind: "command-ran", command });
    }
    if (queryTicketsDone !== undefined) {
      const done = await queryTicketsDone();
      for (const ticket of done) world = applyWorldEvent(world, { kind: "ticket-done", ticket });
    }
    return world;
  }

  const recordedCommands: string[] = [];

  ctx.tools.register(
    defineTool({
      name: TOUR_STATUS_TOOL_NAME,
      description: TOUR_STATUS_TOOL_DESCRIPTION,
      parameters: {},
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", required: true },
            position: { type: "number", required: true },
            total: { type: "number", required: true },
            detect: { type: "boolean", required: true },
            complete: { type: "boolean", required: true },
            stepId: { type: "string" },
            chapter: { type: "number" },
            ticket: { type: "string" },
            text: { type: "string" },
            target: { type: "string" },
            teaching: { type: "string" },
            done: { type: "string" },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: renderTourStatusText(value as Parameters<typeof renderTourStatusText>[0]),
          },
        ],
      },
      isConcurrencySafe: () => true,
      async execute() {
        return canonicalTourStatus(
          tourStatus(STEPS, await currentWorld(recordedCommands), store.load()),
        );
      },
    }),
  );

  const start = (): (() => void) => {
    const stops: Array<() => void> = [];
    const poll = (): void => {
      for (const path of watchedFiles(STEPS)) {
        const absolute = resolveTourPath(workspace, path) as string;
        if (existsSync(absolute)) store.record({ kind: "file-exists", path }, STEPS);
      }
      if (queryTicketsDone !== undefined) {
        void Promise.resolve(queryTicketsDone()).then((done) => {
          for (const ticket of done) store.record({ kind: "ticket-done", ticket }, STEPS);
        });
      }
    };
    poll();
    const timer = setInterval(poll, pollMs);
    stops.push(() => clearInterval(timer));

    if (typeof ctx.on === "function") {
      const commands = watchedCommands(STEPS);
      if (commands.length > 0) {
        const stop = ctx.on("tools/result", (exec: unknown) => {
          const toolName = (exec as { name?: unknown } | null)?.name;
          if (typeof toolName !== "string") return;
          for (const command of commands) {
            if (commandMatchesTool(command, toolName)) {
              if (!recordedCommands.includes(command)) recordedCommands.push(command);
              store.record({ kind: "command-ran", command }, STEPS);
            }
          }
        });
        if (typeof stop === "function") stops.push(stop as () => void);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `${PLUGIN_NAME}: this host offers no ctx.on, so tool observation is off and ` +
          `command-ran conditions wait on the seam only.`,
      );
    }

    return () => {
      for (let i = stops.length - 1; i >= 0; i--) (stops[i] as () => void)();
    };
  };

  if (typeof ctx?.effect === "function") {
    ctx.effect(start, `${PLUGIN_NAME}: tour polling and tool observation`);
    return;
  }
  if (typeof ctx?.on === "function") {
    const stop = start();
    ctx.on("dispose", stop);
    return;
  }

  start();
  // eslint-disable-next-line no-console
  console.warn(
    `${PLUGIN_NAME}: this host provides neither ctx.effect nor ctx.on, so tour polling ` +
      `cannot register its own teardown and will survive unload.`,
  );
}
