/**
 * ORACLE: use dsh's own installed JsonlSessionPersistence backend to prove that
 * a repaired session file can be opened by dsh itself.
 *
 * This is the authoritative proof required by D2(c): the verdict comes from
 * dsh's own loader (`assertZstdHeaderFrame`, `readFirstZstdLine`, `readPrefix`,
 * `SessionLogScanner`), not from this package's own reader — which was the issue
 * that masked the incident (our reader tolerates any framing; dsh's does not).
 *
 * The oracle constructs the real JsonlSessionPersistence backend with a minimal
 * inert cordis Context (only the fields `installWritePath` touches), then calls
 * the exact same methods dsh's session service would call:
 *   - readFirstZstdLine / readFirstLine: the listArtifacts path (header-only)
 *   - readPrefix: the full load path (used by resume/prepare)
 * Both call assertZstdHeaderFrame for zstd files, which is dsh's gate.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { resolveDshPackage, ResolutionError } from "./runtime.mjs";
import { loadSessionModel } from "./runtime.mjs";
import { readHeaderOnly } from "./read.mjs";

/**
 * Load and return the real dsh JsonlSessionPersistence backend, constructed
 * with a minimal inert Context. The backend's readFirstZstdLine and readPrefix
 * methods are the actual dsh code that rejects the incident's broken files.
 *
 * @param {{compression?: string, rootDir?: string, dshPackageRoot?: string}} [opts]
 * @returns {{backend, origin, cleanup}}
 * @throws ResolutionError if dsh cannot be located
 */
export async function loadDshJsonlBackend(opts = {}) {
  const { root, how } = resolveDshPackage({ dshPackageRoot: opts.dshPackageRoot });
  const entry = path.join(root, "node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js");
  if (!fs.existsSync(entry)) {
    throw new ResolutionError(
      "@deepseek-ai/dsh-session-persistence-jsonl",
      [`${entry} does not exist`],
    );
  }

  // Import the persistence module (reachable because it lives under dsh's own
  // node_modules; its imports resolve from its location).
  const mod = await import(entry);
  const Backend = mod.JsonlSessionPersistence ?? mod.default;
  if (!Backend) throw new Error("cannot import JsonlSessionPersistence from dsh");

  // Cordis Context stub: only fields touched by the backend's constructor and
  // the read methods (readFirstZstdLine, readPrefix). installWritePath uses
  // ctx.effect/ctx.on/ctx.sessions.list to set up event listeners and cleanup,
  // all of which are no-ops in our context.
  const inertContext = {
    reflect: { provide() {} },
    effect(fn) { return () => {}; },
    on() { return () => {}; },
    sessions: { list: () => [], get: () => undefined },
    logger: { warn() {} },
  };

  // Create a temp root for the backend's session storage. The backend locates
  // and stages copies here.
  const rootDir = opts.rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "thursday-jsonl-backend-"));
  try {
    fs.accessSync(rootDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw new Error(`rootDir is not readable/writable: ${rootDir}`);
  }

  const compression = opts.compression ?? "zstd";
  const backend = new Backend(inertContext, { root: rootDir, compression });

  return {
    backend,
    origin: { package: "@deepseek-ai/dsh-session-persistence-jsonl", entry, how, root },
    cleanup: () => {
      try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch {}
    },
  };
}

/**
 * Run dsh's own loader against a repaired file and report whether dsh can open it.
 * This is the oracle required by D2(c): proof that the file is good comes from
 * dsh's own assertion, not from this package's reader.
 *
 * The function tests two paths:
 *   1. readFirstZstdLine(file) — what listArtifacts uses to build the sessions list
 *   2. readPrefix(path at dsh's expected location) — what prepare/load use
 * Both must pass; both call assertZstdHeaderFrame for zstd files.
 *
 * @param {string} file path to the repaired file
 * @param {{compression?: string, dshPackageRoot?: string}} [opts]
 * @returns {{ok, problems: string[]}}
 */
export async function proveDshCanOpen(file, opts = {}) {
  let backend, cleanup;
  try {
    // Determine compression from file suffix (matching readArtifact behavior).
    const compression = opts.compression ?? (file.endsWith(".jsonl.zstd") ? "zstd" : "none");
    const loaded = await loadDshJsonlBackend({ compression, dshPackageRoot: opts.dshPackageRoot });
    backend = loaded.backend;
    cleanup = loaded.cleanup;
  } catch (e) {
    return {
      ok: false,
      problems: [`dsh backend could not be loaded: ${e.message}`],
    };
  }

  const problems = [];
  try {
    // Path 1: the header-only read dsh's listArtifacts performs. This is what
    // crashed in the incident (dsh-web.service died at listArtifacts calling
    // readFirstZstdLine, which calls assertZstdHeaderFrame).
    let headerLine;
    try {
      if (backend.compression === "zstd") {
        headerLine = await backend.readFirstZstdLine(file);
      } else {
        headerLine = await backend.readFirstLine(file);
      }
      if (headerLine === undefined) {
        problems.push("dsh's header-only read (listArtifacts path) returned undefined");
      }
    } catch (e) {
      problems.push(
        `dsh's header-only read (readFirstZstdLine, the listArtifacts path) REJECTED: ${e.message}`,
      );
    }

    // Path 2: the full load path dsh's prepare/load/resume use. Requires
    // staging the file at the path dsh's locator computes from the header.
    try {
      const header = await readHeaderOnly(file);
      if (!header?.id) {
        throw new Error("no session header found; cannot compute dsh's expected log path");
      }
      const meta = { id: header.id, cwd: header.cwd ?? "" };
      const location = backend.locate(meta);
      const locPath = location.path;

      // Stage the file at the exact path dsh's locator expects.
      fs.mkdirSync(path.dirname(locPath), { recursive: true });
      fs.copyFileSync(file, locPath);

      // Run dsh's full load path: readPrefix will call scanZstdFrames +
      // decode frames + assertZstdHeaderFrame + SessionLogScanner + assert
      // complete frame boundaries.
      const prefix = await backend.readPrefix(locPath, header.id);
      // A repaired file should not have a torn tail (readPrefix tries to recover
      // from torn frames, but a repair should be complete).
      if (prefix.tornMarker !== undefined) {
        problems.push(
          `dsh's full load recovered a torn tail at byte ${prefix.tornMarker.truncateTo} ` +
          `— a repaired file must be complete`,
        );
      }
      // Path 3: dsh's ACCEPT GATE, which is the layer readPrefix does not reach
      // and which an earlier version of this file missed entirely.
      // PersistenceCoordinator.assertEventsSupported
      // (dsh-session-persistence lib/index.js:1117-1120) runs on prepare(),
      // load(), readFrom() and readStoredPrefix() -- every path that OPENS a
      // session, as opposed to merely reading its bytes:
      //
      //   if (KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true) continue;
      //   throw ... "unknown to this harness and not marked ignorable"
      //
      // A file can pass readPrefix and still be refused here, which is exactly
      // how this package produced a "repaired" log that died on resume. The set
      // below is dsh's own export, so only the one-line predicate is copied.
      try {
        const model = await loadSessionModel({ dshPackageRoot: opts.dshPackageRoot });
        const known = model.KNOWN_SESSION_EVENT_TYPES;
        if (!(known instanceof Set) || known.size === 0) {
          problems.push(
            "dsh's KNOWN_SESSION_EVENT_TYPES could not be read, so the accept gate could not be checked",
          );
        } else {
          for (const ev of prefix.events ?? []) {
            if (known.has(ev.type) || ev.ignorable === true) continue;
            problems.push(
              `dsh's accept gate (assertEventsSupported) REJECTS event type "${ev.type}" ` +
              `at seq ${ev.seq}: unknown to this harness and not marked ignorable`,
            );
            break;
          }
        }
      } catch (e) {
        problems.push(`dsh's accept gate could not be evaluated: ${e.message}`);
      }
    } catch (e) {
      problems.push(`dsh's full load (readPrefix) REJECTED: ${e.message}`);
    }

    return { ok: problems.length === 0, problems };
  } finally {
    if (cleanup) cleanup();
  }
}
