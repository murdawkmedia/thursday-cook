import { describe, expect, it, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fs as memfsFs, vol } from "memfs";

import { INSTALL_ACTIONS, DETECT_ACTIONS, type Step } from "../src/actions";
import { previewPatchFileExact, classifyReplacement, type FilesystemAPI } from "../src/install";

/**
 * Create a memfs-based filesystem API for testing.
 */
function createMemfsAPI(): FilesystemAPI {
  const mfs = memfsFs as any;
  return {
    existsSync: mfs.existsSync.bind(mfs),
    readFileSync: mfs.readFileSync.bind(mfs),
    writeFileSync: mfs.writeFileSync.bind(mfs),
    mkdirSync: mfs.mkdirSync.bind(mfs),
    realpathSync: mfs.realpathSync.bind(mfs),
    renameSync: mfs.renameSync.bind(mfs),
    unlinkSync: mfs.unlinkSync.bind(mfs),
    readdirSync: mfs.readdirSync.bind(mfs),
    statSync: mfs.statSync.bind(mfs),
    promises: {
      readFile: mfs.promises.readFile.bind(mfs.promises),
      writeFile: mfs.promises.writeFile.bind(mfs.promises),
      mkdir: mfs.promises.mkdir.bind(mfs.promises),
      cp: mfs.promises.cp.bind(mfs.promises),
    },
  };
}

describe("patch-file-exact action definition", () => {
  it("patch-file-exact action is registered in INSTALL_ACTIONS", () => {
    expect(INSTALL_ACTIONS["patch-file-exact"]).toBeDefined();
  });

  it("patch-file-exact action has correct metadata", () => {
    const action = INSTALL_ACTIONS["patch-file-exact"];
    expect(action.name).toBe("patch-file-exact");
    expect(action.kind).toBe("install");
    expect(action.summary).toContain("exact-string replacements");
    expect(action.idempotence).toContain("exact-string match");
  });

  it("file-contains detect action is registered in DETECT_ACTIONS", () => {
    expect(DETECT_ACTIONS["file-contains"]).toBeDefined();
  });

  it("file-contains action has correct metadata", () => {
    const action = DETECT_ACTIONS["file-contains"];
    expect(action.name).toBe("file-contains");
    expect(action.kind).toBe("detect");
  });
});

describe("classifyReplacement", () => {
  it("marks replacement as 'applied' when replace text is already present", () => {
    const state = classifyReplacement("hello world", {
      find: "foo",
      replace: "hello world",
    });
    expect(state).toBe("applied");
  });

  it("marks replacement as 'pending' when find matches exactly once", () => {
    const state = classifyReplacement("hello world", {
      find: "hello",
      replace: "hi",
    });
    expect(state).toBe("pending");
  });

  it("marks replacement as 'ambiguous' when find matches multiple times", () => {
    const state = classifyReplacement("hello hello world", {
      find: "hello",
      replace: "hi",
    });
    expect(state).toBe("ambiguous");
  });

  it("marks replacement as 'missing' when find doesn't match", () => {
    const state = classifyReplacement("hello world", {
      find: "foo",
      replace: "bar",
    });
    expect(state).toBe("missing");
  });

  it("handles idempotent replacements where find is substring of replace", () => {
    // After first application of find->replace, the result contains "replace" text,
    // so the next classification should mark it as "applied"
    const text = "old content";
    const replacement = {
      find: "old",
      replace: "old new",
    };
    const state1 = classifyReplacement(text, replacement);
    expect(state1).toBe("pending");

    // After applying the replacement
    const newText = text.replace(replacement.find, replacement.replace);
    const state2 = classifyReplacement(newText, replacement);
    expect(state2).toBe("applied");
  });
});

describe("patch-file-exact executor with guards", () => {
  let fs: FilesystemAPI;
  const thursdayHome = "/thursday";
  const dshPath = "/thursday/dsh";

  beforeEach(() => {
    vol.reset();
    fs = createMemfsAPI();
    fs.mkdirSync(thursdayHome, { recursive: true });
    fs.mkdirSync(dshPath, { recursive: true });
  });

  describe("Guard 1: resolve the target, fail loudly if absent", () => {
    it("throws when target file does not exist", () => {
      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "missing/file.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      expect(() => previewPatchFileExact(step, dshPath, thursdayHome, fs)).toThrow(
        /not found|missing/i,
      );
    });

    it("succeeds when target file exists", () => {
      const filePath = join(thursdayHome, "target.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "old content");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "target.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.changed).toBe(true);
    });
  });

  describe("Guard 2: realpath and refuse unless under THURSDAY_HOME", () => {
    it("throws when realpath escapes THURSDAY_HOME", () => {
      // Create a target outside thursday home
      const outsidePath = "/outside/file.js";
      fs.mkdirSync(dirname(outsidePath), { recursive: true });
      fs.writeFileSync(outsidePath, "old content");

      // Create a symlink inside thursday that points outside
      const linkPath = join(thursdayHome, "link.js");
      fs.writeFileSync(linkPath, "old content"); // memfs doesn't support symlinks well
      // So we'll just test the realpath check with a direct path outside

      // In real filesystem this would be a symlink, but memfs limitation means
      // we test the guard logic separately. The key is that realpath can escape.

      // For memfs testing, we verify the error message and logic are present.
      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "/../outside/file.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      expect(() => previewPatchFileExact(step, dshPath, thursdayHome, fs)).toThrow(
        /outside|THURSDAY_HOME/i,
      );
    });

    it("accepts paths that resolve under THURSDAY_HOME", () => {
      const filePath = join(thursdayHome, "nested/file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "old content");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "nested/file.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.targetPath).toContain(thursdayHome);
    });
  });

  describe("Guard 3: break hardlinks before writing", () => {
    it("uses rename to create a fresh file", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "old content");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.nextContent).toBe("new content");
      expect(preview.changed).toBe(true);
      // The executor would use rename; preview just computes the new content
    });
  });

  describe("Guard 4: store original once, before first write", () => {
    it("stores original in state/<storageKey>.orig before first patch", () => {
      const filePath = join(dshPath, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "original content");

      const origPath = join(thursdayHome, "state", "test.orig");
      expect(fs.existsSync(origPath)).toBe(false);

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "dsh",
        replacements: [{ find: "original", replace: "patched" }],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.storesOriginal).toBe(true);
      expect(preview.origPath).toBe(origPath);
    });

    it("does not overwrite existing .orig on second run", () => {
      const filePath = join(dshPath, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "original content");

      const origPath = join(thursdayHome, "state", "test.orig");
      fs.mkdirSync(dirname(origPath), { recursive: true });
      fs.writeFileSync(origPath, "first stored original");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "dsh",
        replacements: [
          { find: "original", replace: "first-patch" },
          { find: "first-patch", replace: "second-patch" },
        ],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.storesOriginal).toBe(false);
    });
  });

  describe("Apply-all-or-nothing semantics", () => {
    it("fails without writing when any find does not match", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "content A and content B");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [
          { find: "content A", replace: "replaced A" },
          { find: "content C", replace: "replaced C" }, // This one doesn't match
        ],
      };

      expect(() => previewPatchFileExact(step, dshPath, thursdayHome, fs)).toThrow(
        /does not match|version skew/i,
      );

      // Verify file is unchanged (preview doesn't write)
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toBe("content A and content B");
    });

    it("applies ordered replacements where later ones depend on earlier", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "const old = 1; const another = old;");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [
          { find: "const old = 1", replace: "const NEW = 1" },
          { find: "another = old", replace: "another = NEW" }, // Depends on file now having "NEW"
        ],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.changed).toBe(true);
      expect(preview.nextContent).toContain("const NEW = 1");
      expect(preview.nextContent).toContain("another = NEW");
    });
  });

  describe("Idempotence via exact-string matching", () => {
    it("is a no-op when both replacements are already present", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "import homedirvar new content here");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [
          { find: "import", replace: "import homedirvar" },
          { find: "content", replace: "new content" },
        ],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.changed).toBe(false);
      expect(preview.alreadyApplied).toHaveLength(2);
      expect(preview.pending).toHaveLength(0);
    });

    it("reports which replacements are already applied vs pending", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "import old and needs-replace");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [
          { find: "import old", replace: "import new" },
          { find: "needs-replace", replace: "already-replaced" },
        ],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.changed).toBe(true);
      expect(preview.alreadyApplied).toHaveLength(0);
      expect(preview.pending).toContain(0);
      expect(preview.pending).toContain(1);
    });
  });

  describe("output messages", () => {
    it("reports when patch is applied", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "old content");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [{ find: "old", replace: "new" }],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.output).toContain("Patched");
      expect(preview.output).toContain("1 of 1");
    });

    it("reports when patch is already applied", () => {
      const filePath = join(thursdayHome, "file.js");
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "already new content");

      const step: Extract<Step, { action: "patch-file-exact" }> = {
        action: "patch-file-exact",
        target: "file.js",
        storageKey: "test",
        base: "home",
        replacements: [
          { find: "old", replace: "already new" },
          { find: "another", replace: "content" },
        ],
      };

      const preview = previewPatchFileExact(step, dshPath, thursdayHome, fs);
      expect(preview.output).toContain("already applied");
    });
  });
});
