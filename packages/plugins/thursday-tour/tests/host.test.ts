/**
 * The host half: loud mount, tool registration, and derived observation.
 *
 * `defineTool` here is the REAL validator from the harness's own copy
 * (linked by `scripts/link-dsh-packages.mjs`): registering the tool tests
 * the schema against the runtime's enforcer, not a stub. Polling and the
 * `tools/result` listener run against a temp tour workspace and a stub
 * context, so observation is proved over values, not hoped over wiring.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  PLUGIN_NAME,
  apply,
  canonicalTourStatus,
  commandMatchesTool,
  renderTourStatusText,
  resolveTourPath,
  watchedCommands,
  watchedFiles,
} from "../src/host";
import type { TourHostContext } from "../src/host";
import { TourProgressStore } from "../src/progress";
import { STEPS } from "../src/steps.generated";
import { TOUR_STATUS_TOOL_NAME } from "../src/tool";

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "thursday-tour-host-"));
  scratchDirs.push(dir);
  return dir;
}

interface RegisteredTool {
  name: string;
  description: string;
  execute: (args: unknown, exec: unknown) => Promise<unknown>;
}

function stubContext(): {
  ctx: TourHostContext;
  tools: RegisteredTool[];
  setups: Array<() => () => void>;
  listeners: Map<string, (...args: unknown[]) => unknown>;
} {
  const tools: RegisteredTool[] = [];
  const setups: Array<() => () => void> = [];
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const ctx = {
    tools: {
      register: (definition: unknown) => {
        tools.push(definition as RegisteredTool);
        return () => undefined;
      },
    },
    effect: (setup: () => () => void) => {
      setups.push(setup);
      return undefined;
    },
    on: (event: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(event, listener);
      return () => undefined;
    },
  } as unknown as TourHostContext;
  return { ctx, tools, setups, listeners };
}

describe("pure helpers", () => {
  it("is named thursday-tour", () => {
    expect(PLUGIN_NAME).toBe("thursday-tour");
  });

  it("refuses workspace escapes", () => {
    const workspace = scratchDir();
    expect(resolveTourPath(workspace, "wizards/new-post.mjs")).toBe(
      join(workspace, "wizards", "new-post.mjs"),
    );
    expect(resolveTourPath(workspace, "../outside.mjs")).toBeNull();
    expect(resolveTourPath(workspace, "wizards/../../outside.mjs")).toBeNull();
  });

  it("matches slash commands to the tool names the registry observes", () => {
    expect(commandMatchesTool("/compact", "compact")).toBe(true);
    expect(commandMatchesTool("compact", "/compact")).toBe(true);
    expect(commandMatchesTool("/compact", "resume_search")).toBe(false);
  });

  it("watches the files and commands the shipped steps wait on", () => {
    expect(watchedFiles(STEPS)).toEqual(["wizards/new-post.mjs"]);
    expect(watchedCommands(STEPS)).toEqual(["/compact"]);
  });

  it("renders the tool value as text and drops nulls from the canonical form", () => {
    expect(renderTourStatusText({ status: "finished" })).toMatch(/finished/);
    expect(renderTourStatusText({ status: "exited" })).toMatch(/exited/);
    expect(
      renderTourStatusText({
        status: "active",
        position: 1,
        total: 10,
        stepId: "see-blog",
        text: "Run it.",
        target: "[data-composer-seat]",
        teaching: "Action first.",
        done: "Press Next.",
      }),
    ).toMatch(/Tour step 1 of 10/);
  });

  it("canonicalTourStatus carries only what the state has", () => {
    const finished = canonicalTourStatus({
      status: "finished",
      position: 10,
      total: 10,
      stepId: null,
      chapter: null,
      ticket: null,
      text: null,
      target: null,
      teaching: null,
      done: null,
      detect: false,
      complete: true,
    });
    expect(finished["stepId"]).toBeUndefined();
    expect(finished["status"]).toBe("finished");
  });
});

describe("apply", () => {
  it("registers tour_status and fails loudly on a bad composition", () => {
    const workspace = scratchDir();
    const { ctx, tools } = stubContext();
    apply(ctx, { tourWorkspace: workspace, progressFile: join(workspace, "progress.json") });
    expect(tools.map((tool) => tool.name)).toContain(TOUR_STATUS_TOOL_NAME);

    expect(() => apply(ctx, { tourWorkspace: join(workspace, "missing") })).toThrow(
      /does not exist/,
    );
    expect(() => apply({} as TourHostContext, { tourWorkspace: workspace })).toThrow(
      /no tools registry/,
    );
  });

  it("the registered tool executes against live state", async () => {
    const workspace = scratchDir();
    const { ctx, tools } = stubContext();
    apply(ctx, { tourWorkspace: workspace, progressFile: join(workspace, "progress.json") });
    const tool = tools.find((entry) => entry.name === TOUR_STATUS_TOOL_NAME);
    expect(tool).toBeDefined();
    const value = (await tool?.execute({}, { signal: new AbortController().signal })) as Record<
      string,
      unknown
    >;
    expect(value["status"]).toBe("active");
    expect(value["stepId"]).toBe("see-blog");
    expect(value["stepId"]).not.toBeNull();
    for (const key of Object.keys(value)) {
      expect(value[key], `canonical field ${key}`).not.toBeNull();
    }
  });

  it("polls file-exists from the filesystem into durable progress", async () => {
    const workspace = scratchDir();
    const progressFile = join(workspace, "progress.json");
    const { ctx, setups } = stubContext();
    apply(ctx, { tourWorkspace: workspace, progressFile, pollMs: 20 });
    expect(setups.length).toBe(1);
    const stop = (setups[0] as () => () => void)();
    try {
      // The first poll already ran: nothing watched exists yet.
      expect(new TourProgressStore(progressFile).load().done).not.toContain("build-wizard");

      mkdirSync(join(workspace, "wizards"), { recursive: true });
      writeFileSync(join(workspace, "wizards", "new-post.mjs"), "// wizard\n");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(new TourProgressStore(progressFile).load().done).toContain("build-wizard");
    } finally {
      stop();
    }
  });

  it("records command-ran from the tools/result event by tool name", () => {
    const workspace = scratchDir();
    const progressFile = join(workspace, "progress.json");
    const { ctx, listeners, setups } = stubContext();
    apply(ctx, { tourWorkspace: workspace, progressFile, pollMs: 60000 });
    const stop = (setups[0] as () => () => void)();
    try {
      const onResult = listeners.get("tools/result");
      expect(onResult).toBeDefined();

      onResult?.({ name: "resume_search" }, {});
      expect(new TourProgressStore(progressFile).load().done).not.toContain("run-compact");

      // The registry observed `compact`; the step waited on `/compact`.
      onResult?.({ name: "compact" }, {});
      expect(new TourProgressStore(progressFile).load().done).toContain("run-compact");

      onResult?.({}, {});
    } finally {
      stop();
    }
  });

  it("warns, but still mounts, when the host offers no event subscription", () => {
    const workspace = scratchDir();
    const seen: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void seen.push(String(args[0]));
    let stop: (() => void) | undefined;
    try {
      const ctx = {
        tools: { register: () => () => undefined },
        effect: (setup: () => () => void) => {
          stop = setup();
          return undefined;
        },
      } as unknown as TourHostContext;
      apply(ctx, { tourWorkspace: workspace, progressFile: join(workspace, "progress.json") });
      expect(seen.some((line) => line.includes(PLUGIN_NAME))).toBe(true);
    } finally {
      console.warn = original;
      stop?.();
    }
  });
});
