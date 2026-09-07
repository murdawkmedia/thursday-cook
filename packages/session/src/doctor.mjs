/**
 * THE DOCTOR: check a LIVE Thursday installation against what the blocks
 * declare, and report DRIFT.
 *
 * The rule this module obeys, and the reason it is short: a doctor that carries
 * its own copy of the rules drifts from them. So it owns NO rules. Every
 * question of the form "is this correct?" is answered by calling the real
 * function in `packages/install`:
 *
 *   - `loadBlockFile`      (packages/install/src/loader.ts:332) parses each
 *                          block and VALIDATES it against the real schema and
 *                          action registry. A block that no longer parses is
 *                          itself a finding.
 *   - `runDetectStep`      (packages/install/src/install.ts:137) evaluates ONE
 *                          detect predicate against the filesystem. This is the
 *                          "is this already installed?" logic the installer
 *                          itself runs.
 *   - `detectBlockStatus`  (packages/install/src/install.ts:215) folds a
 *                          block's detect steps into a status.
 *   - `DETECT_ACTIONS`     (packages/install/src/actions.ts:301) is the registry
 *                          of predicates, used here to detect registry/executor
 *                          drift inside the install engine itself.
 *   - `orderBlocks`        (packages/install/src/patch.ts:270) resolves
 *                          `dependsOn` into install order.
 *   - `generateWebPatch`   (packages/install/src/patch.ts:526) produces the
 *                          composition the blocks DECLARE, which we diff
 *                          against the composition actually on disk.
 *
 * The one thing this module does own is the DIFF: comparing what those
 * functions say should be true against what the live profile actually contains,
 * and rendering it. That is reporting, not rule-keeping.
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { Finding } from "./diagnose.mjs";

/**
 * Find the installation to inspect.
 *
 * `resolveThursdayHome` (packages/install/src/install.ts:88) gives the
 * CONFIGURED home. But on a developer machine that home may not exist while a
 * real harness lives in `~/.dsh` — and a doctor that reports "nothing is
 * installed" against an empty configured home, while a live install sits next
 * to it, is the worst possible output. So we resolve the configured home AND
 * report every candidate that actually contains a profile, and say which one we
 * inspected.
 *
 * @param {object} engine loaded install engine
 * @param {{dshPath?: string}} [opts]
 */
export function resolveInstallation(engine, opts = {}) {
  const candidates = [];
  const push = (dshPath, label) => {
    if (!dshPath) return;
    const patch = path.join(dshPath, "profiles/web/cordis.patch.yml");
    candidates.push({
      dshPath,
      label,
      exists: fs.existsSync(dshPath),
      hasProfile: fs.existsSync(patch),
      patchFile: patch,
    });
  };

  if (opts.dshPath) push(path.resolve(opts.dshPath), "--dsh-path");

  let configured;
  if (typeof engine.resolveThursdayHome === "function") {
    try {
      configured = engine.resolveThursdayHome();
      push(configured.dshPath, "resolveThursdayHome() (THURSDAY_HOME or ~/.thursday)");
    } catch (e) {
      candidates.push({ dshPath: undefined, label: `resolveThursdayHome() threw: ${e.message}`, exists: false, hasProfile: false });
    }
  }
  push(process.env.DSH_HOME, "$DSH_HOME");
  push(path.join(homedir(), ".dsh"), "~/.dsh");

  const chosen = candidates.find((c) => c.hasProfile);
  return { chosen, candidates, configured };
}

/**
 * Load every block in `packages/blocks/` with the REAL loader.
 *
 * A block that fails to load is a first-class finding: the block set is the
 * declaration of what should be installed, so a block the installer could not
 * read is a hole in that declaration.
 */
export function loadBlockSet(engine, blocksDir) {
  const blocks = [];
  const findings = [];
  let names;
  try {
    names = fs.readdirSync(blocksDir).filter((n) => n.endsWith(".md") && n !== "README.md");
  } catch (e) {
    findings.push(
      new Finding("error", "blocks-unreadable", `Cannot read the block directory ${blocksDir}.`, {
        evidence: e.message,
        why: "packages/blocks/*.md is the declaration of what a Thursday installation should contain. Without it there is nothing to compare the live install against.",
      }),
    );
    return { blocks, findings };
  }
  for (const name of names.sort()) {
    const file = path.join(blocksDir, name);
    try {
      blocks.push({ file, name, block: engine.loadBlockFile(file) });
    } catch (e) {
      // A file with NO frontmatter at all was probably never meant to be a
      // block (notes parked in the block directory). A file that HAS
      // frontmatter but fails validation was meant to be one and is broken —
      // that is the serious case, because an install would fail on it.
      const msg = String(e.message);
      const notEvenABlock = /must start with a `---` line opening its YAML frontmatter/u.test(msg);
      findings.push(
        new Finding(
          notEvenABlock ? "warning" : "error",
          notEvenABlock ? "block-dir-stray-file" : "block-invalid",
          notEvenABlock
            ? `${name} sits in the block directory but is not a block.`
            : `Block ${name} does not load.`,
          {
            where: file,
            evidence: msg.split("\n").slice(0, 6).join(" | "),
            why: notEvenABlock
              ? "It has no YAML frontmatter, so `loadBlockFile` cannot read it as a block. Nothing installs it and nothing validates it; move it out of packages/blocks or give it frontmatter."
              : "`loadBlockFile` validates the block against the real schema and action registry. A block that fails here would also fail an install.",
          },
        ),
      );
    }
  }
  return { blocks, findings };
}

/**
 * INTEGRITY OF THE ENGINE ITSELF.
 *
 * Every action a block references must exist in the registry AND be executable.
 * A `detect` action registered in `DETECT_ACTIONS` but missing from
 * `runDetectStep`'s switch is registry/executor drift inside the install
 * engine: the block loads fine and the installer throws at run time. The doctor
 * finds this by probing the executor with a minimal step for each registered
 * action and watching for the "unknown detect action" throw.
 */
export function checkEngineIntegrity(engine, dshPath) {
  const findings = [];
  if (typeof engine.runDetectStep !== "function") {
    findings.push(
      new Finding("warning", "executor-absent", "The install engine exposes no runDetectStep.", {
        why: "packages/install/src/install.ts is in-flight work. Without it the doctor can compare declarations but cannot evaluate detect predicates against the live filesystem.",
      }),
    );
    return findings;
  }
  const fsApi = engine.createFilesystemAPI ? engine.createFilesystemAPI() : undefined;
  if (!fsApi) return findings;

  const probes = {
    "row-present": { action: "row-present", id: "__doctor_probe__", placement: "insert" },
    "path-exists": { action: "path-exists", path: "__doctor_probe__" },
    "package-installed": { action: "package-installed", name: "__doctor_probe__", profile: "web" },
    "settings-key-equals": { action: "settings-key-equals", file: "settings.yaml", key: "__doctor_probe__", value: 1 },
    "file-contains": { action: "file-contains", file: "__doctor_probe__", text: "x" },
  };
  for (const name of engine.DETECT_ACTION_NAMES ?? []) {
    const probe = probes[name];
    if (!probe) {
      findings.push(
        new Finding("info", "detect-action-unprobed", `Registered detect action \`${name}\` has no doctor probe.`, {
          why: "The action registry gained an action this doctor does not know how to probe. Not a fault in the installation; a gap in this check.",
        }),
      );
      continue;
    }
    try {
      engine.runDetectStep(probe, dshPath, path.dirname(dshPath), fsApi);
    } catch (e) {
      findings.push(
        new Finding("error", "detect-action-unimplemented", `Detect action \`${name}\` is registered but the executor cannot run it.`, {
          where: "packages/install/src/actions.ts DETECT_ACTIONS vs packages/install/src/install.ts runDetectStep",
          evidence: e.message,
          why:
            "`DETECT_ACTIONS` advertises this predicate, so a block may legally use it and will load cleanly — but `runDetectStep` has no case for it and falls through to its throwing default. Any block whose `detect:` uses it fails at install time, not at authoring time.",
          fix: "Add the missing case to runDetectStep, or remove the action from the registry.",
        }),
      );
    }
  }
  return findings;
}

/**
 * THE DRIFT REPORT: what the blocks declare vs what is actually installed.
 *
 * For each block, run its OWN detect steps through the installer's OWN
 * evaluator, per step, so a partially installed block reports WHICH part is
 * missing rather than a single opaque "not installed".
 */
export function detectDrift(engine, blocks, dshPath, thursdayHome) {
  const rows = [];
  const findings = [];
  const fsApi = engine.createFilesystemAPI ? engine.createFilesystemAPI() : undefined;
  if (typeof engine.runDetectStep !== "function" || !fsApi) return { rows, findings };

  for (const { name, block } of blocks) {
    const id = block.frontmatter.id;
    const steps = block.frontmatter.detect ?? [];
    const results = [];
    for (const step of steps) {
      let pass, error;
      try {
        pass = engine.runDetectStep(step, dshPath, thursdayHome, fsApi);
      } catch (e) {
        // Never let one broken predicate abort the whole doctor run.
        error = e.message;
        pass = undefined;
      }
      results.push({ step, pass, error, describe: describeStep(step) });
    }
    const evaluated = results.filter((r) => r.error === undefined);
    const passed = evaluated.filter((r) => r.pass).length;
    const status =
      steps.length === 0
        ? "undeclared"
        : results.some((r) => r.error !== undefined)
          ? "unknown"
          : passed === steps.length
            ? "installed"
            : passed === 0
              ? "absent"
              : "partial";
    rows.push({ id, name, status, passed, total: steps.length, results });

    if (status === "partial") {
      const missing = results.filter((r) => r.pass === false).map((r) => r.describe);
      findings.push(
        new Finding("error", "block-partially-installed", `Block \`${id}\` is only partly installed (${passed}/${steps.length} detect steps pass).`, {
          where: `packages/blocks/${name}`,
          why:
            "A partially installed block is worse than an absent one: the installer's `detectBlockStatus` treats any failing step as 'not installed' and will re-run every step, while the parts already present stay as they are. Missing: " +
            missing.join("; "),
          fix: "Re-run the installer for this block, or install the missing pieces by hand.",
        }),
      );
    }
    if (status === "unknown") {
      findings.push(
        new Finding("warning", "block-undetectable", `Block \`${id}\` could not be evaluated.`, {
          where: `packages/blocks/${name}`,
          evidence: results.find((r) => r.error)?.error,
          why: "One of its detect steps threw. The block's installed state is genuinely unknown, which is different from 'not installed'.",
        }),
      );
    }
    if (steps.length === 0) {
      findings.push(
        new Finding("warning", "block-no-detect", `Block \`${id}\` declares no detect steps.`, {
          where: `packages/blocks/${name}`,
          why: "Without a `detect:` list, the installer cannot tell whether this block is installed, so it re-runs its steps every time and the doctor cannot report drift for it.",
        }),
      );
    }
  }
  return { rows, findings };
}

/** One-line description of a detect step, for a drift row. */
function describeStep(step) {
  switch (step.action) {
    case "package-installed":
      return `package ${step.name} in profile ${step.profile ?? "web"}`;
    case "row-present":
      return `${step.placement ?? "insert"} row \`${step.id}\`${step.name ? ` -> ${step.name}` : ""}${step.disabled !== undefined ? ` (disabled=${step.disabled})` : ""}`;
    case "path-exists":
      return `path ${step.path}`;
    case "settings-key-equals":
      return `${step.file ?? "settings.yaml"}:${step.key} == ${JSON.stringify(step.value)}`;
    case "file-contains":
      return `${step.file} contains ${JSON.stringify(String(step.text).slice(0, 40))}`;
    default:
      return `${step.action}`;
  }
}

/**
 * COMPOSITION DRIFT: the rows the blocks declare vs the rows actually in the
 * live `cordis.patch.yml`.
 *
 * `generateWebPatch` (packages/install/src/patch.ts:526) is the real generator.
 * Rather than re-deriving what the composition should look like, we ask it, and
 * diff its rows against the live file's rows.
 */
export function compositionDrift(engine, blocks, patchFile, parseYaml, dshHome) {
  const findings = [];
  if (typeof engine.generateWebPatch !== "function") return { findings, declared: [], live: [] };

  let declared = [];
  try {
    const ordered = engine.orderBlocks(blocks.map((b) => b.block));
    // `upstreamRows` deliberately left to its default: `generateWebPatch` then
    // compares against the recorded UPSTREAM_ROWS snapshot in
    // packages/install/src/upstream.ts. Passing a table read from the live
    // bundle with `readBundleDefaults` would be stricter, but the doctor must
    // not require a writable install to run.
    const patch = engine.generateWebPatch(ordered, {
      dshHome,
      file: "profiles/web/cordis.patch.yml",
      generator: "thursday session doctor",
    });
    declared = patch.rows
      .filter((r) => r.placement === "insert")
      .map((r) => ({ id: r.id, name: r.entry?.name, block: r.block }));
  } catch (e) {
    findings.push(
      new Finding("warning", "composition-ungeneratable", "The blocks' declared composition could not be generated.", {
        evidence: String(e.message).split("\n").slice(0, 5).join(" | "),
        why:
          "`generateWebPatch` refused to build the composition these blocks declare. Often it needs the upstream bundle defaults (`readBundleDefaults`) that only a real install has; treat this as 'not comparable here', not as a broken install.",
      }),
    );
    return { findings, declared: [], live: [] };
  }

  let live = [];
  try {
    const doc = parseYaml(fs.readFileSync(patchFile, "utf8"));
    const entries = Array.isArray(doc) ? doc : [doc];
    const insert = entries.find((e) => Array.isArray(e?.insert))?.insert ?? [];
    live = insert.map((r) => ({ id: r.id, name: r.name }));
  } catch (e) {
    findings.push(
      new Finding("error", "patch-unreadable", `The live composition patch could not be read.`, {
        where: patchFile,
        evidence: e.message,
      }),
    );
    return { findings, declared, live: [] };
  }

  const liveIds = new Set(live.map((r) => r.id));
  const declaredIds = new Set(declared.map((r) => r.id));
  const missing = declared.filter((r) => !liveIds.has(r.id));
  const extra = live.filter((r) => !declaredIds.has(r.id));
  const renamed = declared
    .filter((r) => liveIds.has(r.id))
    .map((r) => ({ declared: r, live: live.find((l) => l.id === r.id) }))
    .filter((p) => p.declared.name !== undefined && p.live.name !== p.declared.name);

  if (missing.length > 0)
    findings.push(
      new Finding("error", "composition-missing-rows", `${missing.length} row(s) the blocks declare are absent from the live composition.`, {
        where: patchFile,
        why: `Missing: ${missing.map((r) => `${r.id} -> ${r.name}`).join(", ")}. The plugin those rows load is not mounted.`,
      }),
    );
  if (extra.length > 0)
    findings.push(
      new Finding("warning", "composition-extra-rows", `${extra.length} live row(s) no block declares.`, {
        where: patchFile,
        why: `Extra: ${extra.map((r) => `${r.id} -> ${r.name ?? "?"}`).join(", ")}. Installed by hand or by a retired block; nothing in packages/blocks will maintain or uninstall them.`,
      }),
    );
  // Split by kind: a row whose declared AND live values are both filesystem
  // paths has drifted to a different CHECKOUT, which is the ordinary state of a
  // developer machine and a deployment blocker rather than a boot hazard. A row
  // whose values are package names has drifted in what package it loads, which
  // is the failure the alias-install-name constraint exists to prevent.
  const isPath = (v) => typeof v === "string" && (v.startsWith("/") || v.startsWith("./") || v.startsWith("~"));
  const pathDrift = renamed.filter((p) => isPath(p.declared.name) && isPath(p.live.name));
  const packageDrift = renamed.filter((p) => !(isPath(p.declared.name) && isPath(p.live.name)));

  if (pathDrift.length > 0) {
    const dirsFrom = [...new Set(pathDrift.map((p) => path.dirname(String(p.declared.name))))];
    const dirsTo = [...new Set(pathDrift.map((p) => path.dirname(String(p.live.name))))];
    findings.push(
      new Finding("warning", "composition-path-drift", `${pathDrift.length} row(s) load plugin files from a different directory than the blocks declare.`, {
        where: patchFile,
        why:
          `declared under ${dirsFrom.join(", ")}; live under ${dirsTo.join(", ")}. ` +
          `Rows: ${pathDrift.map((p) => p.declared.id).join(", ")}. ` +
          `This is the normal shape of a DEVELOPER machine loading plugins straight out of a working checkout, ` +
          `and it is not a boot hazard — but a machine installed from these blocks would load different files, ` +
          `so the installation is not reproducible from packages/blocks as it stands.`,
        fix: "Either point the blocks at the checkout, or install the plugin files into the declared location.",
      }),
    );
  }
  for (const p of packageDrift)
    findings.push(
      new Finding("error", "composition-row-name-drift", `Row \`${p.declared.id}\` loads a different package than declared.`, {
        where: patchFile,
        why: `declared \`${p.declared.name}\`, live \`${p.live.name}\`. For an aliased install this is exactly the failure the alias-install-name constraint guards: the wrong name here means either a duplicate loader entry at boot, or the builtin shadowing the fork.`,
      }),
    );

  return { findings, declared, live, missing, extra, renamed };
}

/**
 * Run the whole doctor. READ-ONLY: nothing here writes to the installation.
 * (`loadInstallEngine` writes an esbuild bundle to a cache directory outside
 * the installation; that is build output, not a change to the install.)
 */
export async function runDoctor(engine, opts) {
  const findings = [];
  const install = resolveInstallation(engine, opts);
  if (!install.chosen) {
    findings.push(
      new Finding("error", "no-installation", "No Thursday/dsh installation with a web profile was found.", {
        why:
          "Looked for `profiles/web/cordis.patch.yml` under each candidate home: " +
          install.candidates.map((c) => `${c.label} (${c.dshPath ?? "n/a"}) ${c.exists ? "exists" : "absent"}`).join("; "),
        fix: "Pass --dsh-path explicitly, or set THURSDAY_HOME.",
      }),
    );
    return { findings, install, blocks: [], drift: { rows: [] } };
  }

  const dshPath = install.chosen.dshPath;
  const thursdayHome = path.dirname(dshPath);

  const { blocks, findings: blockFindings } = loadBlockSet(engine, opts.blocksDir);
  findings.push(...blockFindings);
  findings.push(...checkEngineIntegrity(engine, dshPath));

  const drift = detectDrift(engine, blocks, dshPath, thursdayHome);
  findings.push(...drift.findings);

  let composition = { declared: [], live: [] };
  if (opts.parseYaml) {
    composition = compositionDrift(engine, blocks, install.chosen.patchFile, opts.parseYaml, dshPath);
    findings.push(...composition.findings);
  }

  findings.sort((a, b) => ({ error: 3, warning: 2, info: 1 })[b.severity] - ({ error: 3, warning: 2, info: 1 })[a.severity]);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return {
    findings,
    counts,
    worst: counts.error > 0 ? "error" : counts.warning > 0 ? "warning" : counts.info > 0 ? "info" : "clean",
    install,
    blocks,
    drift,
    composition,
  };
}

/** Render the drift table plus findings. */
export function renderDoctor(result, opts = {}) {
  const L = [];
  L.push("# thursday doctor");
  L.push("");
  if (result.install.chosen) {
    L.push(`inspecting     ${result.install.chosen.dshPath}   (${result.install.chosen.label})`);
    L.push(`composition    ${result.install.chosen.patchFile}`);
  }
  const others = result.install.candidates.filter((c) => c !== result.install.chosen);
  if (others.length > 0)
    L.push(
      `other homes    ` +
        others.map((c) => `${c.label}=${c.dshPath ?? "n/a"}${c.hasProfile ? " (also has a profile!)" : c.exists ? " (no profile)" : " (absent)"}`).join("  "),
    );
  L.push("");

  if (result.drift.rows.length > 0) {
    L.push(`## block drift — ${result.blocks.length} block(s) declared in packages/blocks`);
    L.push("");
    const mark = { installed: "ok     ", absent: "ABSENT ", partial: "PARTIAL", unknown: "UNKNOWN", undeclared: "no-detect" };
    for (const r of result.drift.rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`  ${mark[r.status] ?? r.status}  ${r.id.padEnd(22)} ${r.passed}/${r.total}`);
      if (opts.verbose || r.status === "partial" || r.status === "unknown") {
        for (const res of r.results) {
          const m = res.error !== undefined ? "ERR " : res.pass ? "  + " : "  - ";
          L.push(`         ${m}${res.describe}${res.error ? `  (${res.error})` : ""}`);
        }
      }
    }
    const tally = result.drift.rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
    L.push("");
    L.push(`  totals: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join("  ")}`);
    L.push("");
  }

  if (result.composition?.live?.length) {
    L.push(`## composition — ${result.composition.live.length} live row(s), ${result.composition.declared.length} declared by blocks`);
    L.push("");
  }

  const mark = { error: "ERROR  ", warning: "WARN   ", info: "INFO   " };
  L.push(
    result.worst === "clean"
      ? "## findings: none"
      : `## findings: ${result.counts.error} error(s), ${result.counts.warning} warning(s), ${result.counts.info} info`,
  );
  for (const f of result.findings) {
    L.push("");
    L.push(`${mark[f.severity]}${f.code}: ${f.title}`);
    if (f.where) L.push(`       at    ${f.where}`);
    if (f.why) L.push(`       why   ${f.why}`);
    if (f.evidence) L.push(`       saw   ${String(f.evidence).slice(0, 300)}`);
    if (f.fix) L.push(`       fix   ${f.fix}`);
  }
  return L.join("\n");
}
