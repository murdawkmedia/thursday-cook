import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";

import {
  OUTSIDE_THE_HOME_EFFECTS,
  findUnexpectedFiles,
  getIconRemovalPaths,
  resolveThursdayHome,
  expandPath,
  uninstall,
  type UninstallResult,
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
      (e) => e.kind === "file" && e.path.includes(".local/bin/thursday")
    );
    expect(launcher).toBeDefined();
    expect(launcher?.enumeration).toBe("static");
    expect(launcher?.path).toBe("~/.local/bin/thursday");
  });

  it("desktop entry: ~/.local/share/applications/thursday.desktop, static enumeration", () => {
    const desktop = OUTSIDE_THE_HOME_EFFECTS.find(
      (e) => e.kind === "file" && e.path.includes("thursday.desktop")
    );
    expect(desktop).toBeDefined();
    expect(desktop?.enumeration).toBe("static");
    expect(desktop?.path).toBe("~/.local/share/applications/thursday.desktop");
  });

  it("Criterion 1: icon entry marked as derived from scripts/build-brand-assets.mjs", () => {
    const icons = OUTSIDE_THE_HOME_EFFECTS.find(
      (e) => e.kind === "file" && e.path.includes("hicolor")
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

  it("expands ~ in THURSDAY_HOME", () => {
    process.env.THURSDAY_HOME = "~/custom-thursday";
    const resolved = resolveThursdayHome();
    expect(resolved).not.toContain("~");
    expect(resolved).toContain("custom-thursday");
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
        })
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
      for (const dir of ["app", "runtime", "dsh", "state", "cache"]) {
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
      for (const dir of ["app", "runtime", "dsh", "state", "cache"]) {
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

describe("Criterion 5: AI scratch and tour workspace preservation", () => {
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
      for (const dir of ["app", "runtime", "dsh", "state", "cache"]) {
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
      for (const dir of ["app", "runtime", "dsh", "state", "cache"]) {
        mkdirSync(join(tempThursdayHome, dir), { recursive: true });
      }
      writeFileSync(join(tempThursdayHome, "user-file.txt"), "content");

      const result = uninstall(true); // dry run

      expect(existsSync(join(tempThursdayHome, "user-file.txt"))).toBe(true);
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
  it("expandPath() handles ~ expansion", () => {
    const expanded = expandPath("~/.local/bin");
    expect(expanded).not.toContain("~");
    expect(expanded).toContain(".local");
  });

  it("expandPath() leaves absolute paths unchanged", () => {
    const path = "/absolute/path";
    expect(expandPath(path)).toBe(path);
  });
});
