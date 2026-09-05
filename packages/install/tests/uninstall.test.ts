import { describe, it, expect, afterEach, vi } from "vitest";
import { join } from "node:path";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdtempSync,
  readdirSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";

import {
  OUTSIDE_THE_HOME_EFFECTS,
  KNOWN_THURSDAY_DIRS,
  findUnexpectedFiles,
  getIconRemovalPaths,
  resolveThursdayHome,
  expandPath,
  uninstall,
  uninstallWithOutput,
} from "../src/uninstall";

describe("I7 Ticket Criteria - OUTSIDE_THE_HOME_EFFECTS enumeration", () => {
  it("Criterion 1: enumerates the outside-the-home effects as a single exported CONSTANT", () => {
    // Per spec: "Enumerate it in code, not in prose, so adding a fourth outside-the-home
    // effect without adding its removal fails a test."
    expect(OUTSIDE_THE_HOME_EFFECTS).toBeDefined();
    expect(Array.isArray(OUTSIDE_THE_HOME_EFFECTS)).toBe(true);
    expect(OUTSIDE_THE_HOME_EFFECTS.length).toBeGreaterThan(0);
  });

  it("has exactly 3 file entries (launcher, desktop, icons) per spec Q6", () => {
    const fileEffects = OUTSIDE_THE_HOME_EFFECTS.filter((e) => e.kind === "file");
    expect(fileEffects).toHaveLength(3);
  });

  it("has exactly 2 command entries (update-desktop-database, gtk-update-icon-cache) per spec Q6", () => {
    const commandEffects = OUTSIDE_THE_HOME_EFFECTS.filter((e) => e.kind === "command");
    expect(commandEffects).toHaveLength(2);
    expect(commandEffects.map((e) => e.path).sort()).toEqual([
      "gtk-update-icon-cache",
      "update-desktop-database",
    ]);
  });

  it("launcher entry: ~/.local/bin/thursday, static enumeration", () => {
    const launcher = OUTSIDE_THE_HOME_EFFECTS.find(
      (e) => e.kind === "file" && e.path.includes(".local/bin/thursday"),
    );
    expect(launcher).toBeDefined();
    expect(launcher?.enumeration).toBe("static");
    expect(launcher?.path).toBe("~/.local/bin/thursday");
  });

  it("desktop entry: ~/.local/share/applications/thursday.desktop, static enumeration", () => {
    const desktop = OUTSIDE_THE_HOME_EFFECTS.find(
      (e) => e.kind === "file" && e.path.includes("thursday.desktop"),
    );
    expect(desktop).toBeDefined();
    expect(desktop?.enumeration).toBe("static");
    expect(desktop?.path).toBe("~/.local/share/applications/thursday.desktop");
  });

  it("Criterion 1: icon entry marked as derived from scripts/build-brand-assets.mjs", () => {
    const icons = OUTSIDE_THE_HOME_EFFECTS.find(
      (e) => e.kind === "file" && e.path.includes("hicolor"),
    );
    expect(icons).toBeDefined();
    expect(icons?.enumeration).toBe("derived");
    expect(icons?.derivedFrom).toBe("scripts/build-brand-assets.mjs");
    expect(icons?.path).toBe("~/.local/share/icons/hicolor");
  });

  it("each entry has description for output", () => {
    for (const effect of OUTSIDE_THE_HOME_EFFECTS) {
      expect(effect.description).toBeTruthy();
      expect(typeof effect.description).toBe("string");
    }
  });
});

describe("Criterion 2 & 3: THURSDAY_HOME resolution and home deletion", () => {
  const originalEnv = process.env.THURSDAY_HOME;

  afterEach(() => {
    process.env.THURSDAY_HOME = originalEnv;
  });

  it("resolves THURSDAY_HOME from env var when set", () => {
    process.env.THURSDAY_HOME = "/custom/path";
    expect(resolveThursdayHome()).toBe("/custom/path");
  });

  it("expands ~ in THURSDAY_HOME to a path UNDER the user's home", () => {
    process.env.THURSDAY_HOME = "~/custom-thursday";
    const resolved = resolveThursdayHome();
    expect(resolved).not.toContain("~");
    // The old assertion was `toContain("custom-thursday")`, which "/custom-thursday"
    // at the filesystem root also satisfies. Pin the whole path instead.
    expect(resolved).toBe(join(homedir(), "custom-thursday"));
  });

  it("defaults to ~/.thursday when env var unset", () => {
    delete process.env.THURSDAY_HOME;
    const resolved = resolveThursdayHome();
    expect(resolved).toContain(".thursday");
  });

  it("ignores empty THURSDAY_HOME", () => {
    process.env.THURSDAY_HOME = "";
    const resolved = resolveThursdayHome();
    expect(resolved).toContain(".thursday");
  });
});

describe("Criterion 1: Icon removal set derived from assets-manifest.json", () => {
  it("includes hardcoded fallback sizes when manifest missing", () => {
    const paths = getIconRemovalPaths("/nonexistent/path");
    expect(paths.length).toBeGreaterThan(0);

    // Fallback sizes: [16, 24, 32, 48, 64, 128, 256]
    const pathsStr = paths.join(",");
    expect(pathsStr).toContain("16x16");
    expect(pathsStr).toContain("24x24");
    expect(pathsStr).toContain("32x32");
    expect(pathsStr).toContain("48x48");
    expect(pathsStr).toContain("64x64");
    expect(pathsStr).toContain("128x128");
    expect(pathsStr).toContain("256x256");
  });

  it("always includes scalable SVG", () => {
    const paths = getIconRemovalPaths("/nonexistent/path");
    const hasScalableSvg = paths.some((p) => p.includes("scalable") && p.includes("thursday.svg"));
    expect(hasScalableSvg).toBe(true);
  });

  it("can read assets-manifest.json from a real path", () => {
    // Create a temporary directory with a manifest
    const tempDir = tmpdir();
    const testDir = join(tempDir, `thursday-test-${Date.now()}`);
    const distDir = join(testDir, "dist", "brand");

    try {
      mkdirSync(distDir, { recursive: true });
      writeFileSync(
        join(distDir, "assets-manifest.json"),
        JSON.stringify({
          outputs: [
            { path: "hicolor/thursday-16.png", purpose: "hicolor app icon, 16px" },
            { path: "hicolor/thursday-256.png", purpose: "hicolor app icon, 256px" },
            { path: "hicolor/thursday.svg", purpose: "scalable icon" },
            { path: "favicon/favicon.svg", purpose: "browser favicon" },
          ],
        }),
      );

      const paths = getIconRemovalPaths(testDir);
      expect(paths.length).toBeGreaterThan(0);
      // Should include the hicolor entries but not favicon
      const pathsStr = paths.join(",");
      expect(pathsStr).toContain("hicolor");
      expect(pathsStr).not.toContain("favicon");
    } finally {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  });
});

describe("Criterion 4: Unexpected file detection", () => {
  it("detects unexpected files at THURSDAY_HOME top level", () => {
    const tempDir = join(tmpdir(), `thursday-test-${Date.now()}`);

    try {
      mkdirSync(tempDir, { recursive: true });
      // Create known directories
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(tempDir, dir), { recursive: true });
      }
      // Create unexpected file
      writeFileSync(join(tempDir, "user-notes.txt"), "user content");
      mkdirSync(join(tempDir, "user-dir"));

      const unexpected = findUnexpectedFiles(tempDir);
      expect(unexpected).toContain(join(tempDir, "user-notes.txt"));
      expect(unexpected).toContain(join(tempDir, "user-dir"));
    } finally {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("does not report known Thursday directories as unexpected", () => {
    const tempDir = join(tmpdir(), `thursday-test-${Date.now()}`);

    try {
      mkdirSync(tempDir, { recursive: true });
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(tempDir, dir), { recursive: true });
      }

      const unexpected = findUnexpectedFiles(tempDir);
      expect(unexpected).toEqual([]);
    } finally {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("returns empty array for non-existent directory", () => {
    const unexpected = findUnexpectedFiles("/nonexistent/path");
    expect(unexpected).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * Real-uninstall harness.
 *
 * These tests run uninstall() for real, so they must never be able to touch the
 * developer's actual home directory. os.homedir() reads $HOME on POSIX and
 * re-reads it on every call, so pointing $HOME at a fresh temp directory
 * contains every path the engine computes: THURSDAY_HOME, ~/.local/bin,
 * ~/.local/share/..., and ~/.ai-scratch all land inside the sandbox.
 *
 * withRealHome() asserts the redirection actually took effect before handing
 * the sandbox to the test body. If $HOME were ever ignored, the guard throws
 * instead of letting a recursive delete loose on a real home.
 * ---------------------------------------------------------------------- */

interface Sandbox {
  home: string;
  thursdayHome: string;
}

function withRealHome(body: (sandbox: Sandbox) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const originalHome = process.env.HOME;
    const originalThursdayHome = process.env.THURSDAY_HOME;
    const home = mkdtempSync(join(tmpdir(), "thursday-realhome-"));

    try {
      process.env.HOME = home;

      // Safety guard: refuse to run a real uninstall unless the sandbox is live.
      if (homedir() !== home) {
        throw new Error(
          `refusing to run a real uninstall: $HOME redirection failed ` +
            `(homedir() is ${homedir()}, expected ${home})`,
        );
      }

      const thursdayHome = join(home, ".thursday");
      process.env.THURSDAY_HOME = thursdayHome;

      await body({ home, thursdayHome });
    } finally {
      process.env.HOME = originalHome;
      if (originalThursdayHome === undefined) {
        delete process.env.THURSDAY_HOME;
      } else {
        process.env.THURSDAY_HOME = originalThursdayHome;
      }
      if (existsSync(home)) {
        rmSync(home, { recursive: true, force: true });
      }
    }
  };
}

/** Build a populated Thursday home plus one file the user created inside it. */
function seedHomeWithUserFile(thursdayHome: string): string {
  mkdirSync(thursdayHome, { recursive: true });
  for (const dir of KNOWN_THURSDAY_DIRS) {
    mkdirSync(join(thursdayHome, dir), { recursive: true });
  }
  writeFileSync(join(thursdayHome, "app", "thursday-owned.txt"), "thursday content");

  const userFile = join(thursdayHome, "my-notes.txt");
  writeFileSync(userFile, "notes the user kept in here");
  return userFile;
}

describe("BLOCKING DEFECT: the printed promise must match what actually happens", () => {
  it(
    "REAL uninstall (default policy): a user-created file inside the home survives, as promised",
    withRealHome(({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);

      // A real uninstall. Not a dry run.
      const result = uninstall(false);

      // The message that is printed.
      const printed = result.messages.join("\n");
      expect(printed).toContain("will NOT be deleted");
      expect(printed).toContain(userFile);

      // The behaviour that follows it. This is the assertion the old test could
      // never make, because it only ever ran uninstall(true).
      expect(existsSync(userFile)).toBe(true);
      expect(readFileSync(userFile, "utf8")).toBe("notes the user kept in here");

      // ...and it was a genuine uninstall, not a no-op that trivially preserves.
      for (const dir of KNOWN_THURSDAY_DIRS) {
        expect(existsSync(join(thursdayHome, dir))).toBe(false);
      }

      // The structured result agrees with both.
      expect(result.success).toBe(true);
      expect(result.unexpectedFilePolicy).toBe("preserve");
      expect(result.preservedUnexpectedFiles).toContain(userFile);
      expect(result.deletedUnexpectedFiles).toEqual([]);
      expect(result.homeRemoved).toBe(false);
    }),
  );

  it(
    "REAL uninstall (delete policy): the message says they WILL BE DELETED, and they are",
    withRealHome(({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);

      const result = uninstall(false, undefined, "delete");

      const printed = result.messages.join("\n");
      // The preserve promise must NOT be printed by the path that deletes.
      expect(printed).not.toContain("will NOT be deleted");
      expect(printed).toContain("WILL BE DELETED");
      expect(printed).toContain(userFile);

      expect(existsSync(userFile)).toBe(false);
      expect(existsSync(thursdayHome)).toBe(false);
      expect(result.homeRemoved).toBe(true);
      expect(result.deletedUnexpectedFiles).toContain(userFile);
      expect(result.preservedUnexpectedFiles).toEqual([]);
    }),
  );

  it(
    "the printed promise and the on-disk outcome agree under BOTH policies",
    withRealHome(({ thursdayHome }) => {
      // Policy-agnostic consistency check: read the promise out of the message
      // text, then hold the filesystem to it. This is the invariant the defect
      // violated, expressed directly.
      for (const policy of ["preserve", "delete"] as const) {
        rmSync(thursdayHome, { recursive: true, force: true });
        const userFile = seedHomeWithUserFile(thursdayHome);

        const result = uninstall(false, undefined, policy);
        const printed = result.messages.join("\n");

        const promisedSurvival = printed.includes("will NOT be deleted");
        const promisedDeletion = printed.includes("WILL BE DELETED");

        // Exactly one promise is made about the user's file.
        expect(promisedSurvival).not.toBe(promisedDeletion);

        // And the disk matches the promise that was made.
        expect(existsSync(userFile)).toBe(promisedSurvival);
      }
    }),
  );

  it(
    "REAL uninstall with no user files removes the home entirely",
    withRealHome(({ thursdayHome }) => {
      mkdirSync(thursdayHome, { recursive: true });
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(thursdayHome, dir), { recursive: true });
      }

      const result = uninstall(false);

      expect(existsSync(thursdayHome)).toBe(false);
      expect(result.homeRemoved).toBe(true);
      expect(result.unexpectedFiles).toEqual([]);
      expect(result.messages.join("\n")).not.toContain("will NOT be deleted");
    }),
  );

  it(
    "preserving leaves the user's file and nothing else behind",
    withRealHome(({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);
      mkdirSync(join(thursdayHome, "user-dir"), { recursive: true });
      writeFileSync(join(thursdayHome, "user-dir", "inner.txt"), "nested user content");

      uninstall(false);

      // Both user entries survive, including the nested content of a directory.
      expect(existsSync(userFile)).toBe(true);
      expect(readFileSync(join(thursdayHome, "user-dir", "inner.txt"), "utf8")).toBe(
        "nested user content",
      );

      // Nothing Thursday-owned remains beside them.
      expect(readdirSync(thursdayHome).sort()).toEqual(["my-notes.txt", "user-dir"]);
    }),
  );
});

describe("Criterion: uninstall ASKS before deleting files the user made in the home", () => {
  it(
    "names the files and deletes them only when the user answers yes",
    withRealHome(async ({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);
      // Capture into our own array: mockRestore() clears mock.calls.
      const printedLines: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        printedLines.push(args.map(String).join(" "));
      });
      const asked: string[] = [];
      // What had already been printed at the moment the question was asked.
      let printedWhenAsked = "";

      try {
        await uninstallWithOutput(false, async (question) => {
          asked.push(question);
          printedWhenAsked = printedLines.join("\n");
          return true; // the user explicitly agrees
        });
      } finally {
        log.mockRestore();
      }

      // It asked exactly once, and it had already named the file when it asked.
      expect(asked).toHaveLength(1);
      expect(printedWhenAsked).toContain(userFile);

      // And it honoured the answer.
      expect(existsSync(userFile)).toBe(false);
      expect(existsSync(thursdayHome)).toBe(false);
    }),
  );

  it(
    "keeps the files when the user answers no",
    withRealHome(async ({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let asked = 0;

      try {
        await uninstallWithOutput(false, async () => {
          asked += 1;
          return false; // the user declines
        });
      } finally {
        log.mockRestore();
      }

      expect(asked).toBe(1);
      expect(existsSync(userFile)).toBe(true);
      expect(readFileSync(userFile, "utf8")).toBe("notes the user kept in here");
      // The Thursday-owned parts still went away.
      expect(existsSync(join(thursdayHome, "app"))).toBe(false);
    }),
  );

  it(
    "does not ask at all when there are no user files to ask about",
    withRealHome(async ({ thursdayHome }) => {
      mkdirSync(thursdayHome, { recursive: true });
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(thursdayHome, dir), { recursive: true });
      }
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let asked = 0;

      try {
        await uninstallWithOutput(false, async () => {
          asked += 1;
          return true;
        });
      } finally {
        log.mockRestore();
      }

      expect(asked).toBe(0);
      expect(existsSync(thursdayHome)).toBe(false);
    }),
  );

  it(
    "a dry run never asks and never deletes",
    withRealHome(async ({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let asked = 0;

      try {
        await uninstallWithOutput(true, async () => {
          asked += 1;
          return true;
        });
      } finally {
        log.mockRestore();
      }

      expect(asked).toBe(0);
      expect(existsSync(userFile)).toBe(true);
      expect(existsSync(join(thursdayHome, "app"))).toBe(true);
    }),
  );

  it(
    "with no terminal to ask on, the answer defaults to keeping the files",
    withRealHome(async ({ thursdayHome }) => {
      const userFile = seedHomeWithUserFile(thursdayHome);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const originalIsTty = process.stdin.isTTY;

      try {
        // vitest runs without a TTY on stdin, but pin it so the test states the
        // condition it is actually exercising rather than assuming the runner's.
        Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
        // No confirm callback: exercise the real default prompt.
        await uninstallWithOutput(false);
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTty,
          configurable: true,
        });
        log.mockRestore();
      }

      expect(existsSync(userFile)).toBe(true);
      expect(readFileSync(userFile, "utf8")).toBe("notes the user kept in here");
    }),
  );
});

describe("Criterion 5: AI scratch and tour workspace preservation", () => {
  it(
    "REAL uninstall: a real AI scratch directory and its contents survive",
    withRealHome(({ home, thursdayHome }) => {
      // Real scratch content, not a string comparison.
      const scratch = join(home, ".ai-scratch");
      const tour = join(scratch, "trying-out-thursday");
      const nested = join(tour, "notes", "deep");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(scratch, "scratch-note.md"), "# my scratch note");
      writeFileSync(join(tour, "tour.md"), "# tour workspace content");
      writeFileSync(join(nested, "buried.txt"), "buried user content");

      seedHomeWithUserFile(thursdayHome);

      const result = uninstall(false); // REAL uninstall

      // The directory and every piece of content inside it still exist.
      expect(existsSync(scratch)).toBe(true);
      expect(existsSync(tour)).toBe(true);
      expect(existsSync(nested)).toBe(true);
      expect(readFileSync(join(scratch, "scratch-note.md"), "utf8")).toBe("# my scratch note");
      expect(readFileSync(join(tour, "tour.md"), "utf8")).toBe("# tour workspace content");
      expect(readFileSync(join(nested, "buried.txt"), "utf8")).toBe("buried user content");

      // The scratch paths were never in the removal set.
      expect(result.removedPaths.some((p) => p.startsWith(scratch))).toBe(false);

      // And this was a real uninstall that really removed things.
      expect(result.removedPaths.length).toBeGreaterThan(0);
      expect(existsSync(join(thursdayHome, "app"))).toBe(false);
    }),
  );

  it(
    "REAL uninstall that deletes the home entirely still leaves the scratch alone",
    withRealHome(({ home, thursdayHome }) => {
      const scratch = join(home, ".ai-scratch");
      const tour = join(scratch, "trying-out-thursday");
      mkdirSync(tour, { recursive: true });
      writeFileSync(join(tour, "tour.md"), "# tour workspace content");

      seedHomeWithUserFile(thursdayHome);

      // The most destructive path available: user confirmed full deletion.
      uninstall(false, undefined, "delete");

      expect(existsSync(thursdayHome)).toBe(false);
      expect(existsSync(scratch)).toBe(true);
      expect(readFileSync(join(tour, "tour.md"), "utf8")).toBe("# tour workspace content");
    }),
  );

  it("explicitly names ~/.ai-scratch in preservedPaths", () => {
    // Set THURSDAY_HOME to a temp location for testing
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      const result = uninstall(true); // dry run

      expect(result.preservedPaths.aiScratchDirectory).toContain(".ai-scratch");
      expect(result.messages.some((m) => m.includes(".ai-scratch"))).toBe(true);
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });

  it("explicitly names trying-out-thursday in preservedPaths", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      const result = uninstall(true); // dry run

      expect(result.preservedPaths.tourWorkspace).toContain("trying-out-thursday");
      expect(result.messages.some((m) => m.includes("trying-out-thursday"))).toBe(true);
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });

  it("output explains these are user files not touched", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      const result = uninstall(true);

      const preservedMsg = result.messages.find((m) => m.includes("Preserved"));
      expect(preservedMsg).toBeTruthy();
      expect(result.messages.some((m) => m.includes("user"))).toBe(true);
      expect(result.messages.some((m) => m.includes("not touched"))).toBe(true);
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });
});

describe("Criterion 6: Tree-diff-provable guarantee", () => {
  it("creates UninstallResult with all required fields", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      mkdirSync(join(tempThursdayHome, "app"), { recursive: true });

      const result = uninstall(true);

      expect(result.success).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(Array.isArray(result.removedPaths)).toBe(true);
      expect(Array.isArray(result.unexpectedFiles)).toBe(true);
      expect(Array.isArray(result.preservedUnexpectedFiles)).toBe(true);
      expect(Array.isArray(result.deletedUnexpectedFiles)).toBe(true);
      expect(typeof result.homeRemoved).toBe("boolean");
      expect(result.unexpectedFilePolicy).toBe("preserve");
      expect(result.preservedPaths).toBeDefined();
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });

  it("reports detected unexpected files in result.unexpectedFiles", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(tempThursdayHome, dir), { recursive: true });
      }
      writeFileSync(join(tempThursdayHome, "user-file.txt"), "content");

      const result = uninstall(true);

      expect(result.unexpectedFiles.length).toBeGreaterThan(0);
      expect(result.unexpectedFiles[0]).toContain("user-file.txt");
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });

  it("does not delete unexpected files on dry run", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      for (const dir of KNOWN_THURSDAY_DIRS) {
        mkdirSync(join(tempThursdayHome, dir), { recursive: true });
      }
      writeFileSync(join(tempThursdayHome, "user-file.txt"), "content");

      uninstall(true); // dry run

      expect(existsSync(join(tempThursdayHome, "user-file.txt"))).toBe(true);
      // A dry run must not remove the Thursday-owned entries either.
      expect(existsSync(join(tempThursdayHome, "app"))).toBe(true);
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });

  it("includes all OUTSIDE_THE_HOME_EFFECTS in output messages on dry run", () => {
    const tempThursdayHome = join(tmpdir(), `thursday-${Date.now()}`);
    process.env.THURSDAY_HOME = tempThursdayHome;

    try {
      mkdirSync(tempThursdayHome, { recursive: true });
      const result = uninstall(true);

      // Check that launcher is mentioned (messages will have expanded path, not ~/)
      expect(result.messages.some((m) => m.includes(".local/bin/thursday"))).toBe(true);

      // Check that desktop entry is mentioned
      expect(result.messages.some((m) => m.includes("thursday.desktop"))).toBe(true);

      // Check that icon set is mentioned
      expect(result.messages.some((m) => m.includes("hicolor"))).toBe(true);

      // Check that commands are mentioned
      expect(result.messages.some((m) => m.includes("update-desktop-database"))).toBe(true);
      expect(result.messages.some((m) => m.includes("gtk-update-icon-cache"))).toBe(true);
    } finally {
      delete process.env.THURSDAY_HOME;
      if (existsSync(tempThursdayHome)) {
        rmSync(tempThursdayHome, { recursive: true, force: true });
      }
    }
  });
});

describe("Helper functions", () => {
  it("expandPath() expands ~ to a path UNDER the user's home", () => {
    // The old assertion was `toContain(".local")`, which the broken result
    // "/.local/bin" (at the filesystem root) also satisfied. Pin the full path.
    expect(expandPath("~/.local/bin")).toBe(join(homedir(), ".local/bin"));
    expect(expandPath("~/.local/bin")).not.toContain("~");
  });

  it("expandPath() expands a bare ~ to the home directory", () => {
    expect(expandPath("~")).toBe(homedir());
  });

  it("expandPath() leaves absolute paths unchanged", () => {
    const path = "/absolute/path";
    expect(expandPath(path)).toBe(path);
  });

  it("every enumerated outside-the-home file path expands under the user's home", () => {
    // Q6's whole point is that these three removals actually happen. A path that
    // expands outside the home can never match the file the installer wrote.
    const fileEffects = OUTSIDE_THE_HOME_EFFECTS.filter((e) => e.kind === "file");
    expect(fileEffects.length).toBeGreaterThan(0);
    for (const effect of fileEffects) {
      expect(expandPath(effect.path).startsWith(homedir() + "/")).toBe(true);
    }
  });
});

describe("Outside-the-home removals actually remove the enumerated files", () => {
  it(
    "REAL uninstall deletes the launcher and the desktop entry",
    withRealHome(({ home, thursdayHome }) => {
      mkdirSync(thursdayHome, { recursive: true });

      // Place the two static outside-the-home artifacts exactly where the
      // installer puts them.
      const launcher = join(home, ".local/bin/thursday");
      const desktop = join(home, ".local/share/applications/thursday.desktop");
      mkdirSync(join(home, ".local/bin"), { recursive: true });
      mkdirSync(join(home, ".local/share/applications"), { recursive: true });
      writeFileSync(launcher, "#!/bin/sh\n");
      writeFileSync(desktop, "[Desktop Entry]\n");

      // A neighbouring user binary, to prove only Thursday's file goes.
      const usersOwnBinary = join(home, ".local/bin/my-tool");
      writeFileSync(usersOwnBinary, "#!/bin/sh\n");

      const result = uninstall(false);

      expect(existsSync(launcher)).toBe(false);
      expect(existsSync(desktop)).toBe(false);
      expect(result.removedPaths).toContain(launcher);
      expect(result.removedPaths).toContain(desktop);

      // Per Q6, ~/.local/bin itself is a standard user directory and survives.
      expect(existsSync(join(home, ".local/bin"))).toBe(true);
      expect(existsSync(usersOwnBinary)).toBe(true);
    }),
  );

  it(
    "REAL uninstall deletes the enumerated icon files",
    withRealHome(({ home, thursdayHome }) => {
      mkdirSync(thursdayHome, { recursive: true });

      const icon48 = join(home, ".local/share/icons/hicolor/48x48/apps/thursday.png");
      const iconSvg = join(home, ".local/share/icons/hicolor/scalable/apps/thursday.svg");
      const otherApp = join(home, ".local/share/icons/hicolor/48x48/apps/someone-else.png");
      mkdirSync(join(home, ".local/share/icons/hicolor/48x48/apps"), { recursive: true });
      mkdirSync(join(home, ".local/share/icons/hicolor/scalable/apps"), { recursive: true });
      writeFileSync(icon48, "png");
      writeFileSync(iconSvg, "svg");
      writeFileSync(otherApp, "not ours");

      uninstall(false);

      expect(existsSync(icon48)).toBe(false);
      expect(existsSync(iconSvg)).toBe(false);
      // Another application's icon in the same shared directory is untouched.
      expect(existsSync(otherApp)).toBe(true);
    }),
  );
});
