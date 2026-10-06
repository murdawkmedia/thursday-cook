/**
 * `thursday session` — the command surface.
 *
 *   thursday session list                  every session, newest first
 *   thursday session show    <id|path>     the BOUNDED readable summary
 *   thursday session search  <id> <regex>  bounded regex search over the log
 *   thursday session recall  <id> <ref>    exact original content for a pointer
 *   thursday session fold    <id>          what the projection folded to, and why
 *   thursday session diagnose <id>         structural defects; READ-ONLY
 *   thursday session repair  <id>          write a repaired COPY
 *   thursday session import                copy selected dsh sessions in —
 *                                          NOTHING is copied without --select
 *   thursday session doctor                the installation drift report
 *
 * Every read command is read-only. `diagnose --prove-readonly` checksums the
 * artifact before and after and refuses to exit 0 if they differ.
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

import { loadSessionModel, loadCompactionFork, loadInstallEngine, ResolutionError } from "./runtime.mjs";
import {
  openSessionFile,
  defaultSessionRoots,
  findSessionArtifacts,
  readHeaderOnly,
  checksumFile,
} from "./read.mjs";
import { summarize, recall as recallView, search as searchView, VIEW_DEFAULTS } from "./view.mjs";
import { runDiagnostics, renderDiagnostics } from "./diagnose.mjs";
import { planRepair, applyRepair, verifyRepair, confirmRepair, renderPlan } from "./repair.mjs";
import { runDoctor, renderDoctor } from "./doctor.mjs";
import { runImport, scanImportSource } from "./import.mjs";
import { sanitizeTitle, normalizeSessionId } from "./classify.mjs";

const USAGE = `thursday session — inspect, diagnose and repair dsh session logs

  list                          list sessions (header-only read: fast on huge logs)
  show <id|path>                bounded readable summary of one session
  search <id|path> <pattern>    bounded regex search over the durable log
  recall <id|path> <type> <id>  exact original content (type: seq|result|checkpoint)
  fold <id|path>                what the surface projection folded to, and why
  diagnose <id|path>            structural defects. NEVER modifies the session.
  repair <id|path>              write a repaired COPY (original always kept)
  import                        list importable dsh sessions by tree; copy
                                ONLY the --select picks (never moves a byte)
  doctor                        check the live installation against packages/blocks

common options
  --root <dir>          session root (default: every known root)
  --project <key>       restrict to one project directory
  --json                machine-readable output
  --max-tokens <n>      summary token bound (default ${VIEW_DEFAULTS.maxTokens})
  --max-lines <n>       summary line bound (default ${VIEW_DEFAULTS.maxLines})
  --max-turns <n>       turn digests shown (default ${VIEW_DEFAULTS.maxTurns})

diagnose options
  --prove-readonly      checksum before and after; non-zero exit if they differ

repair options
  --dry-run             print the plan, write nothing
  --out <path>          destination for the repaired copy
  --close-turns         append dsh's own interruptedTurnClosers output
  --drop-unparsable     remove lines that will not JSON-parse
  --drop-duplicate-seq  remove later records claiming an already-used seq
  --truncate-at <line>  keep only records up to this line
  --confirm             promote the copy; the original is RENAMED, never deleted

import options
  --from <dir>          source dsh sessions root (default: $DSH_HOME/sessions, ~/.dsh/sessions)
  --dest <dir>          Thursday sessions root (default: $THURSDAY_HOME/dsh/sessions,
                        ~/.thursday/dsh/sessions)
  --select <ids>        comma-separated session ids to import. A selection takes
                        the WHOLE tree (parent + subagents) so no orphan is made.
                        Without --select nothing is ever copied.
  --quarantine <dir>    where malformed logs go (default: <dest>/../quarantine)
  --dry-run             print what would happen, copy nothing

doctor options
  --repo <dir>          Thursday checkout (default: cwd, then ./thursday)
  --dsh-path <dir>      the installation to inspect
  --blocks <dir>        block directory (default: <repo>/packages/blocks)
  --verbose             show every detect step, not just failing ones
`;

/** Minimal flag parser: --key value, --flag, positionals. */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      // `--key=value` is REQUIRED for values that themselves start with `--`.
      // dsh's own project directory keys look like `--home-sid-repos-thursday--`,
      // so `--project --home-…--` is genuinely ambiguous and must be written
      // `--project=--home-…--`.
      const eq = a.indexOf("=");
      if (eq > 2) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(a);
  }
  return { flags, positional };
}

/** Resolve a session reference: an absolute path, or an id to look up. */
async function resolveSession(ref, flags) {
  if (ref && (ref.includes("/") || ref.endsWith(".zstd") || ref.endsWith(".jsonl"))) {
    const p = path.resolve(ref);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return { file: p, sessionId: path.basename(path.dirname(p)) };
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const s of ["session.jsonl.zstd", "session.jsonl"]) {
        const f = path.join(p, s);
        if (fs.existsSync(f)) return { file: f, sessionId: path.basename(p) };
      }
    }
    throw new Error(`no session artifact at ${p}`);
  }
  const all = await listArtifacts(flags);
  const hits = all.filter((a) => a.sessionId === ref || a.sessionId.startsWith(ref));
  if (hits.length === 0) throw new Error(`no session matching "${ref}". Run \`thursday session list\`.`);
  if (hits.length > 1)
    throw new Error(
      `"${ref}" matches ${hits.length} sessions:\n` + hits.slice(0, 10).map((h) => `  ${h.sessionId}`).join("\n"),
    );
  return hits[0];
}

async function listArtifacts(flags) {
  const roots = flags.root
    ? [{ root: path.resolve(flags.root), label: "--root" }]
    : defaultSessionRoots(process.env, process.env.HOME ?? homedir());
  const out = [];
  for (const r of roots) {
    for (const a of findSessionArtifacts(r.root, { project: flags.project })) out.push({ ...a, rootLabel: r.label });
  }
  return out;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @returns {Promise<number>} process exit code */
export async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const command = positional[0];
  if (!command || flags.help || command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }

  const viewOpts = {
    maxTokens: num(flags["max-tokens"], VIEW_DEFAULTS.maxTokens),
    maxLines: num(flags["max-lines"], VIEW_DEFAULTS.maxLines),
    maxTurns: num(flags["max-turns"], VIEW_DEFAULTS.maxTurns),
  };

  const say = (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");
  const asJson = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");

  try {
    switch (command) {
      // -------------------------------------------------------------- list
      case "list": {
        const arts = await listArtifacts(flags);
        arts.sort((a, b) => b.mtime - a.mtime);
        const rows = [];
        for (const a of arts) {
          // Header-only: decodes ONE zstd frame, so this is fast on a 9 MB log.
          const h = await readHeaderOnly(a.file).catch(() => undefined);
          rows.push({
            sessionId: a.sessionId,
            project: a.project,
            bytes: a.bytes,
            modified: new Date(a.mtime).toISOString(),
            cwd: h?.cwd,
            preset: h?.agentPreset,
            parent: h?.parentSession,
            depth: h?.delegationDepth,
            readable: h !== undefined,
            file: a.file,
          });
        }
        if (flags.json) return asJson(rows), 0;
        say(`${rows.length} session(s)\n`);
        say(
          ["  modified", "size", "preset", "d", "session"].join("").length
            ? "  modified              size      preset      d  session"
            : "",
        );
        for (const r of rows.slice(0, num(flags.limit, 50))) {
          const size = r.bytes < 1024 * 1024 ? `${(r.bytes / 1024).toFixed(0)}K` : `${(r.bytes / 1048576).toFixed(1)}M`;
          say(
            `  ${r.modified.slice(0, 19).replace("T", " ")}  ${size.padStart(7)}  ` +
              `${String(r.preset ?? "?").padEnd(10)}  ${String(r.depth ?? 0)}  ${r.sessionId}` +
              (r.readable ? "" : "   [header unreadable]"),
          );
        }
        if (rows.length > num(flags.limit, 50)) say(`  … +${rows.length - num(flags.limit, 50)} more (--limit N)`);
        return 0;
      }

      // -------------------------------------------------------------- show
      case "show": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);
        const opened = await openSessionFile(target.file, model);
        const sum = summarize(opened, model, fork, viewOpts);
        if (flags.json)
          return (
            asJson({
              file: target.file,
              checksum: opened.artifact.checksum,
              tokens: sum.tokens,
              lines: sum.lines,
              withinBound: sum.withinBound,
              bound: sum.bound,
              facts: sum.facts,
              text: sum.text,
            }),
            0
          );
        say(sum.text);
        return 0;
      }

      // ------------------------------------------------------------ search
      case "search": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);
        const pattern = positional.slice(2).join(" ");
        if (!pattern) throw new Error("search needs a pattern");
        const opened = await openSessionFile(target.file, model);
        const res = searchView(opened.session, fork, pattern, {
          maxRecallTokens: num(flags["max-tokens"], fork.DEFAULT_MAX_RECALL_TOKENS),
        });
        if (flags.json) return asJson(res), 0;
        say(res.text);
        return res.totalMatches > 0 ? 0 : 1;
      }

      // ------------------------------------------------------------ recall
      case "recall": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);
        const type = positional[2] ?? "seq";
        const id = positional.slice(3).join(" ") || positional[2];
        const opened = await openSessionFile(target.file, model);
        const res = recallView(
          opened.session,
          fork,
          positional[3] !== undefined ? type : "seq",
          id,
          num(flags["max-tokens"], fork.DEFAULT_MAX_RECALL_TOKENS),
        );
        if (!res.ok) {
          for (const e of res.errors) process.stderr.write(`error: ${e}\n`);
          return 2;
        }
        if (flags.json) return asJson(res), 0;
        say(res.text);
        say(
          `\n[recalled ${res.recalled} seq(s), ${res.missing} missing, ${res.skipped} skipped, ${res.tokens} tokens${res.truncated ? ", TRUNCATED by budget" : ""}]`,
        );
        return 0;
      }

      // -------------------------------------------------------------- fold
      case "fold": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);
        const opened = await openSessionFile(target.file, model);
        const diag = runDiagnostics(opened, model, fork);
        const checkpoints = fork.findCheckpointSeqs(opened.session);
        const out = {
          file: target.file,
          events: opened.events.length,
          surface: diag.fold
            ? { nodes: diag.fold.nodes.length, replacements: diag.fold.replacements }
            : { error: diag.findings.find((f) => f.code === "surface-inconsistent")?.evidence },
          checkpoints,
        };
        if (flags.json) return asJson(out), 0;
        say(`# projection fold — ${path.basename(path.dirname(target.file))}`);
        say("");
        say(`events in log        ${opened.events.length}`);
        if (!diag.fold) {
          say(`surface              INCONSISTENT: ${out.surface.error}`);
          return 1;
        }
        say(`model-visible nodes  ${diag.fold.nodes.length}`);
        say(`replacements         ${diag.fold.replacements.length}`);
        say(`checkpoints          ${checkpoints.length}${checkpoints.length ? ` at seq ${checkpoints.join(", ")}` : ""}`);
        for (const r of diag.fold.replacements) {
          say("");
          say(`  replacement at seq ${r.seq}`);
          say(`    declared range   ${r.start}..${r.end}`);
          say(`    actually shadowed ${r.shadowedSeqs.length} surface entr(ies)`);
          if (r.shadowedSeqs.length > 0)
            say(`    seqs             ${r.shadowedSeqs.slice(0, 20).join(", ")}${r.shadowedSeqs.length > 20 ? ` … +${r.shadowedSeqs.length - 20}` : ""}`);
          const node = opened.session.events[r.seq];
          if (node) {
            const msg = model.deriveEventMessage(node);
            if (msg) {
              const text = fork.projectMessageText(msg);
              const head = fork.truncateTokens(text, 120, "fold view bound");
              say(`    folded to        ${head.text.split("\n").slice(0, 6).join("\n                     ")}`);
            }
          }
        }
        return 0;
      }

      // ---------------------------------------------------------- diagnose
      case "diagnose": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);

        // SAFETY PROPERTY 2, proven rather than asserted.
        const before = checksumFile(target.file);
        const opened = await openSessionFile(target.file, model);
        const diag = runDiagnostics(opened, model, fork);
        const after = checksumFile(target.file);
        const untouched = before === after;

        if (flags.json)
          return (
            asJson({
              file: target.file,
              checksumBefore: before,
              checksumAfter: after,
              untouched,
              worst: diag.worst,
              counts: diag.counts,
              findings: diag.findings,
            }),
            untouched ? (diag.counts.error > 0 ? 1 : 0) : 3
          );
        say(`# diagnose ${path.basename(path.dirname(target.file))}`);
        say(`  ${target.file}`);
        say("");
        say(renderDiagnostics(diag));
        if (flags["prove-readonly"] || flags.verbose) {
          say("");
          say(`read-only proof   sha256 before ${before}`);
          say(`                  sha256 after  ${after}`);
          say(`                  ${untouched ? "IDENTICAL — diagnosis did not modify the session." : "*** MISMATCH — THE FILE CHANGED ***"}`);
        }
        if (!untouched) return 3;
        return diag.counts.error > 0 ? 1 : 0;
      }

      // ------------------------------------------------------------ repair
      case "repair": {
        const model = await loadSessionModel(flags);
        const fork = await loadCompactionFork(flags);
        const target = await resolveSession(positional[1], flags);
        const opened = await openSessionFile(target.file, model);
        const diag = runDiagnostics(opened, model, fork);
        const plan = planRepair(diag, {
          closeTurns: Boolean(flags["close-turns"]),
          dropUnparsable: Boolean(flags["drop-unparsable"]),
          dropDuplicateSeq: Boolean(flags["drop-duplicate-seq"]),
          truncateAtLine: flags["truncate-at"] !== undefined ? Number(flags["truncate-at"]) : undefined,
        });

        say(`# repair ${path.basename(path.dirname(target.file))}`);
        say(`  source ${target.file}`);
        say("");
        say(renderPlan(plan));

        if (flags["dry-run"] || !plan.willChangeAnything) {
          say("");
          say(flags["dry-run"] ? "[--dry-run: nothing written]" : "[no operations selected: nothing written]");
          return 0;
        }

        const dest =
          flags.out !== undefined && flags.out !== true
            ? path.resolve(String(flags.out))
            : target.file.replace(/(\.jsonl(?:\.zstd)?)$/u, `.repaired-${Date.now()}$1`);

        const applied = await applyRepair(target.file, plan, dest);
        const verified = await verifyRepair(target.file, dest, applied.droppedLines);

        say("");
        say(`WROTE A COPY. The original is untouched.`);
        say(`  copy      ${applied.destination}`);
        say(`  original  ${applied.source}`);
        say(`  original sha256 before ${applied.originalChecksum}`);
        say(`  original sha256 after  ${applied.originalChecksumAfterRepair}`);
        say(`  original untouched     ${applied.originalUntouched}`);
        say("");
        say(`GOOD-DATA PROOF`);
        say(`  original records        ${verified.originalRecords}`);
        say(`  dropped by plan         ${verified.droppedRecords}`);
        say(`  appended by plan        ${verified.appendedRecords}`);
        say(`  expected survivors      ${verified.expectedSurvivors}`);
        say(`  byte-identical in copy  ${verified.byteIdenticalSurvivors}`);
        say(`  ALL GOOD DATA SURVIVED  ${verified.allGoodDataSurvived}`);
        for (const p of verified.problems) say(`  ! ${p}`);

        if (!verified.allGoodDataSurvived) {
          say("");
          say("REFUSING to offer promotion: the copy does not preserve every good record.");
          return 3;
        }

        if (flags.confirm) {
          const promoted = confirmRepair(applied, { confirm: true });
          say("");
          say(`PROMOTED.`);
          say(`  live file              ${promoted.liveFile}`);
          say(`  ORIGINAL PRESERVED AT  ${promoted.originalPreservedAt}`);
          say(`  undo                   ${promoted.undo}`);
        } else {
          say("");
          say(`NOT PROMOTED. The session still points at the original.`);
          say(`  Inspect the copy:  thursday session diagnose ${applied.destination}`);
          say(`  Then promote:      thursday session repair ${positional[1]} <same flags> --confirm`);
        }
        return 0;
      }

      // ------------------------------------------------------------- import
      case "import": {
        // THE LIST IS THE DEFAULT ACTION. Without --select this prints what
        // could be imported and copies nothing: 719 MB is not a thing to copy
        // silently, and an unattended run imports zero sessions (#233).
        const sourceRoot = path.resolve(
          flags.from !== undefined && flags.from !== true
            ? String(flags.from)
            : process.env.DSH_HOME
              ? path.join(process.env.DSH_HOME, "sessions")
              : path.join(process.env.HOME ?? homedir(), ".dsh", "sessions"),
        );
        const destRoot = path.resolve(
          flags.dest !== undefined && flags.dest !== true
            ? String(flags.dest)
            : process.env.THURSDAY_HOME
              ? path.join(process.env.THURSDAY_HOME, "dsh", "sessions")
              : path.join(process.env.HOME ?? homedir(), ".thursday", "dsh", "sessions"),
        );
        const quarantineRoot =
          flags.quarantine !== undefined && flags.quarantine !== true
            ? path.resolve(String(flags.quarantine))
            : path.join(path.dirname(destRoot), "quarantine");
        const select = flags.select === true || flags.select === undefined
          ? []
          : String(flags.select).split(",").map((s) => s.trim()).filter(Boolean);

        if (select.length === 0) {
          const scan = await scanImportSource(sourceRoot);
          if (flags.json) return asJson(scan), 0;
          const byId = new Map(scan.sessions.map((s) => [s.id, s]));
          let total = 0;
          say(`source   ${sourceRoot}`);
          say(`dest     ${destRoot}`);
          say("");
          say(`${scan.trees.length} tree(s), ${scan.sessions.length} session(s). NOTHING imported — pass --select <id> to import a tree.`);
          for (const t of scan.trees) {
            say("");
            say(`  tree ${t.treeId.slice(0, 8)}…  (${t.members.length} session(s))`);
            for (const id of t.members) {
              const s = byId.get(id);
              if (!s) continue;
              total += s.bytes;
              const size = s.bytes < 1024 * 1024 ? `${(s.bytes / 1024).toFixed(0)}K` : `${(s.bytes / 1048576).toFixed(1)}M`;
              say(
                `    ${id.slice(0, 8)}…  ${s.workspace}  ${s.modified.slice(0, 19).replace("T", " ")}  ${size.padStart(7)}` +
                  `  ${String(s.delegationDepth)}  ${sanitizeTitle(s.title)}` +
                  (s.importable ? "" : "   [will be quarantined]"),
              );
            }
          }
          if (scan.superseded.length > 0) {
            say("");
            say(`  ${scan.superseded.length} .superseded sibling(s) — never imported as sessions`);
          }
          say("");
          say(`total ${total < 1024 * 1024 ? `${(total / 1024).toFixed(0)}K` : `${(total / 1048576).toFixed(1)}M`}. Import one tree:  thursday session import --select ${scan.trees[0]?.treeId.slice(0, 8) ?? "<id>"}`);
          return 0;
        }

        const report = await runImport({ sourceRoot, destRoot, quarantineRoot, select, dryRun: Boolean(flags["dry-run"]) });
        if (flags.json) return asJson(report), 0;
        say(`source   ${sourceRoot}`);
        say(`dest     ${destRoot}`);
        say("");
        for (const i of report.imported) {
          say(`  ${flags["dry-run"] ? "would import" : "imported"}  ${i.id}  ${i.workspace}  ${sanitizeTitle(i.title)}`);
        }
        for (const q of report.quarantined) {
          say(`  QUARANTINED  ${normalizeSessionId(q.sessionId)}  ${q.workspace}  ${q.reason}`);
        }
        say("");
        say(
          `${flags["dry-run"] ? "would import" : "imported"} ${report.counts.imported} session(s) in ${report.counts.trees} tree(s); ` +
            `${report.counts.quarantined} quarantined (counted, under ${report.quarantineRoot}); ` +
            `${report.counts.superseded} .superseded sibling(s) skipped.`,
        );
        say(`The source was read only — it is byte-identical to before the import.`);
        return 0;
      }

      // ------------------------------------------------------------ doctor
      case "doctor": {
        const repoRoot = path.resolve(
          flags.repo !== undefined && flags.repo !== true ? String(flags.repo) : process.cwd(),
        );
        const engine = await loadInstallEngine({ repoRoot });
        // Resolve `yaml` the way node would from inside packages/install, so a
        // pnpm store layout (where it lives under node_modules/.pnpm/…) works.
        let parseYaml;
        try {
          const { createRequire } = await import("node:module");
          const req = createRequire(path.join(repoRoot, "packages/install/package.json"));
          ({ parse: parseYaml } = await import(req.resolve("yaml")));
        } catch {
          parseYaml = undefined; // composition diff is skipped and said so
        }
        const result = await runDoctor(engine, {
          dshPath: flags["dsh-path"] !== undefined && flags["dsh-path"] !== true ? String(flags["dsh-path"]) : undefined,
          blocksDir:
            flags.blocks !== undefined && flags.blocks !== true
              ? path.resolve(String(flags.blocks))
              : path.join(repoRoot, "packages/blocks"),
          parseYaml,
        });
        if (flags.json) return asJson(result), result.counts.error > 0 ? 1 : 0;
        say(renderDoctor(result, { verbose: Boolean(flags.verbose) }));
        return result.counts.error > 0 ? 1 : 0;
      }

      default:
        process.stderr.write(`unknown command "${command}"\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    if (e instanceof ResolutionError) {
      process.stderr.write(`error: ${e.message}\n`);
      return 4;
    }
    process.stderr.write(`error: ${e.message}\n`);
    if (flags.verbose) process.stderr.write(String(e.stack) + "\n");
    return 2;
  }
}
