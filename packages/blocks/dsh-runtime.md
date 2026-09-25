---
id: dsh-runtime
title: Thursday's pinned dsh runtime
version: 1
rationale: >
  The dsh runtime, pinned to an exact version and installed into a private
  Thursday directory. Every Thursday session runs this dsh, never the user's
  own dsh from PATH. This isolation allows Thursday to control the shipped
  preset root and apply patches Thursday needs (the fs-sandbox exemption for
  aidos), guarantees E6's checksum test, and prevents version skew on rows
  and overrides written against a specific dsh version.
dependsOn: []
installs:
  - path: runtime/
    from: "@deepseek-ai/dsh, at the exact version pinned by the runtime/package.json write-file step below"
    what: >
      the pinned dsh runtime, a private pnpm install under $THURSDAY_HOME/runtime/
      with @deepseek-ai/dsh at an exact version. The launcher execs
      runtime/node_modules/.bin/dsh by absolute path and never resolves dsh
      from PATH.
modifies: []
dshConfig: []
steps:
  - action: write-file
    path: runtime/package.json
    content: |
      {
        "name": "thursday-dsh-runtime",
        "version": "0.0.0",
        "private": true,
        "dependencies": {
          "@deepseek-ai/dsh": "0.1.5-rc.3"
        }
      }
    why: >
      The package.json for the pnpm install. The version of @deepseek-ai/dsh
      is pinned in exactly one place: this file. I10 requires that the pin
      appears in one file only, and a mismatch must fail the build.
  - action: pnpm-install
    cwd: runtime
    storeDir: cache/pnpm-store
    why: >
      Install the runtime with pnpm using Thursday's private store directory.
      The store lives inside the home so uninstall removes all pnpm artifacts.
  - action: patch-file-exact
    target: "runtime/node_modules/.pnpm/@deepseek-ai+dsh-sandbox@*/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js"
    storageKey: "dsh-sandbox"
    replacements:
      - find: "import { tmpdir } from \"node:os\";"
        replace: "import { homedir, tmpdir } from \"node:os\";"
      - find: "function writableRoots(policy) {\n\tif (policy.mode !== \"workspace-write\") return [];\n\treturn [...new Set([\n\t\tpolicy.workspaceRoot,\n\t\t\"/tmp\",\n\t\ttmpdir()\n\t].map(canonicalPath))];\n}"
        replace: "function writableRoots(policy) {\n\tif (policy.mode !== \"workspace-write\") return [];\n\treturn [...new Set([\n\t\tpolicy.workspaceRoot,\n\t\t\"/tmp\",\n\t\ttmpdir(),\n\t\tscratchRootForWorkspace(policy.workspaceRoot)\n\t].map(canonicalPath))];\n}\n/**\n * The aidos durable scratch root for one workspace: the harness policy says\n * scratch writes are allowed in every phase, and the aidos write boundary\n * already exempts the root - the sandbox was the one layer missing it\n * (aidos ticket #60). The mangling mirrors workspaceKeyFromPath.\n */\nfunction scratchRootForWorkspace(workspaceRoot) {\n\tif (!workspaceRoot) return null;\n\tconst home = process.env.DSH_HOME || homedir() + \"/.dsh\";\n\tlet readable = \"\";\n\tlet previousWasSeparator = false;\n\tfor (const character of String(workspaceRoot)) {\n\t\tif (character === \"/\" || character === \"\\\\\" || character === \":\") {\n\t\t\tif (!previousWasSeparator) readable += \"-\";\n\t\t\tpreviousWasSeparator = true;\n\t\t\tcontinue;\n\t\t}\n\t\tpreviousWasSeparator = false;\n\t\tif (character !== \"~\" && /[A-Za-z0-9._-]/.test(character)) {\n\t\t\treadable += character;\n\t\t\tcontinue;\n\t\t}\n\t\treadable += \"~\" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, \"0000\");\n\t}\n\treadable = readable.replace(/^-+/, \"\");\n\tif (readable === \"\") readable = \"root\";\n\treturn home + \"/aidos/scratch/--\" + readable + \"--\";\n}"
    why: >
      The fs-sandbox patch to allow writes to the aidos durable scratch root.
      Replacement 1 makes homedir available by adding it to the tmpdir import
      (idempotent: the find is the old import without homedir). Replacement 2
      extends writableRoots to include the aidos scratch root and inlines the
      scratchRootForWorkspace helper that computes it, using the --wrapper
      that aidos's workspaceKeyFromPath produces.
detect:
  - action: path-exists
    path: runtime/package.json
    base: home
  - action: path-exists
    path: runtime/node_modules/.bin/dsh
    base: home
  - action: file-contains
    file: "runtime/node_modules/.pnpm/@deepseek-ai+dsh-sandbox@*/node_modules/@deepseek-ai/dsh-sandbox/lib/index.js"
    text: "return home + \"/aidos/scratch/--\" + readable + \"--\";"
    why: The fs-sandbox patch has been applied.
---

# dsh-runtime

Thursday runs its own copy of the dsh runtime, pinned to an exact version,
stored at `$THURSDAY_HOME/runtime/`. This isolates Thursday from the user's
dsh installation and gives Thursday control over every dsh feature Thursday
needs to use.

## Why install rather than adopt

Q5 of `docs/dsh-home.md` records the full argument. Summarized:

1. **It makes E6 testable.** E6 checksums the dsh package tree before and
   after install. If Thursday runs from the user's tree, patches (like A6's
   fs-sandbox exemption) would mutate the shared tree, and E6's check either
   fails or is meaningless.

2. **The shipped preset root travels with the binary.** dsh computes it as
   `new URL("../config/agent-presets/", import.meta.url)` from its own lib/,
   and injects it with `trust: "system"`. Owning the runtime means Thursday
   owns that root, so "patch the shipped preset" becomes "ship our own preset
   beside a shipped one we never touch".

3. **Version skew is silent.** Every composition row and override written in
   this plan is for a specific dsh: the `command-compact` enable, the
   `llm-pi-ai` disable, the `ui-jobs` override all assume exact dsh internals.
   An unpinned runtime makes every upstream release a breakage with no changed
   file to blame.

4. **The user's dsh may not exist.** Nothing ensures dsh is installed
   globally. "Install globally if missing" is a side effect on someone else's
   PATH — the thing this design refuses.

## The version pin

The version is pinned in exactly one place: `runtime/package.json` in the
write-file step above, as the dependency on `@deepseek-ai/dsh`. This is how the
pin was determined (from the development machine at the time I10 was built):

```
cat /home/sid/.local/share/fnm/node-versions/v24.15.0/installation/lib/node_modules/@deepseek-ai/dsh/package.json | jq '.version'
```

Result: the version pinned in the package.json step (see line 32 above).

Any other file that mentions this version is a violation of I10's single-source
criterion and must be caught by a test.

## The fs-sandbox exemption

The `patch-file-exact` step applies A6's fs-sandbox patch to Thursday's own dsh
copy. The patch adds the aidos durable scratch root to the sandbox's writable-roots
list, allowing `scratch_write` and other aidos fs tools to work. Because this
patch is applied to Thursday's private copy, not the user's tree, E6's checksum
of the shared dsh is unaffected — Thursday keeps the promise that "the user's
dsh is never opened".

The original bytes are stored at `$THURSDAY_HOME/state/dsh-sandbox.orig` before
the first patch, for `thursday status` and `thursday sync` to use. Uninstall
removes the patched file together with the runtime; there is no edit to revert.

## What to check when it goes wrong

- **`runtime/node_modules/.bin/dsh` is missing**: the pnpm-install step did not
  run to completion. Check that pnpm itself is installed and that the store
  directory is writable.

- **The fs-sandbox patch fails**: Check that the target file was found and that
  its content matches the expected anchors. The patch fails loudly on version
  skew, so this is either a dsh bump that needs the patch re-derived, or a
  filesystem problem.

- **Sessions report `FS_SANDBOX_DENIED` on `scratch_write`**: The patch did not
  apply or was reverted. Verify the detect step and check the file at the
  runtime path.
