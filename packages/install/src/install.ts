import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import * as fsDefault from "node:fs";
import * as fsPromisesDefault from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { Block } from "./loader";
import type { DetectStep, Step } from "./actions";
import { rowPresentSatisfied } from "./actions";
import { orderBlocks } from "./patch";

/**
 * Filesystem API that can be injected for testing.
 * Allows passing memfs volume in tests, real fs in production.
 */
export interface FilesystemAPI {
  existsSync: typeof fsDefault.existsSync;
  readFileSync: typeof fsDefault.readFileSync;
  writeFileSync: typeof fsDefault.writeFileSync;
  mkdirSync: typeof fsDefault.mkdirSync;
  promises: {
    readFile: typeof fsPromisesDefault.readFile;
    writeFile: typeof fsPromisesDefault.writeFile;
    mkdir: typeof fsPromisesDefault.mkdir;
    cp: typeof fsPromisesDefault.cp;
  };
}

/**
 * A problem encountered while planning or executing an install.
 */
export interface InstallProblem {
  block?: string;
  step?: number;
  message: string;
}

export type DetectionStatus = "not-installed" | "installed-and-current" | "installed-but-drifted";

export interface BlockDetection {
  blockId: string;
  status: DetectionStatus;
  shouldInstall: boolean;
  reason: string;
}

export interface PlannedStep {
  blockId: string;
  blockRationale: string;
  index: number;
  step: Step;
  dryRun: boolean;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
  problems: InstallProblem[];
}

export interface StepResult {
  step: PlannedStep;
  changed: boolean;
  output: string;
}

export interface InstallResult {
  steps: StepResult[];
  anyChanged: boolean;
  problems: InstallProblem[];
}

export interface InstallOptions {
  thursdayHome?: string;
  dryRun?: boolean;
  quiet?: boolean;
  fs?: FilesystemAPI;
}

export interface ResolvedThursdayHome {
  path: string;
  dshPath: string;
}

/**
 * Resolve THURSDAY_HOME according to dsh-home.md Q1 rules and guards.
 */
export function resolveThursdayHome(
  env?: Record<string, string>,
  homeDir?: string,
): ResolvedThursdayHome {
  const environment = env ?? process.env;
  const home = homeDir ?? homedir();

  let thursdayHome = environment.THURSDAY_HOME?.trim() ?? "";
  if (!thursdayHome) {
    thursdayHome = join(home, ".thursday");
  } else {
    if (thursdayHome.startsWith("~/")) {
      thursdayHome = join(home, thursdayHome.slice(2));
    } else if (thursdayHome === "~") {
      thursdayHome = home;
    }
  }

  thursdayHome = resolve(thursdayHome);

  // Guard 1: refuse if overlaps with user's ~/.dsh
  const userDshHome = environment.DSH_HOME?.trim() ?? join(home, ".dsh");
  const resolvedUserDsh = resolve(userDshHome);
  if (
    thursdayHome === resolvedUserDsh ||
    thursdayHome.startsWith(resolvedUserDsh + "/") ||
    resolvedUserDsh.startsWith(thursdayHome + "/")
  ) {
    throw new Error(
      `THURSDAY_HOME cannot overlap with user's dsh home: ` +
      `resolved THURSDAY_HOME=${thursdayHome}, user DSH_HOME=${resolvedUserDsh}`
    );
  }

  // Guard 2: refuse if starts with /mnt/ (WSL rule)
  if (thursdayHome.startsWith("/mnt/")) {
    throw new Error(
      `THURSDAY_HOME cannot be under /mnt/ (WSL DrvFs): ` +
      `resolved THURSDAY_HOME=${thursdayHome}`
    );
  }

  const dshPath = join(thursdayHome, "dsh");
  return { path: thursdayHome, dshPath };
}

/**
 * Run a single detect step against the filesystem.
 */
export function runDetectStep(
  step: DetectStep,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): boolean {
  switch (step.action) {
    case "path-exists": {
      const path = join(dshPath, step.path);
      return fs.existsSync(path);
    }

    case "package-installed": {
      const profile = step.profile ?? "web";
      const nodeModules = join(dshPath, "profiles", profile, "node_modules", step.name);
      return fs.existsSync(nodeModules);
    }

    case "row-present": {
      const patchPath = join(dshPath, "profiles/web/cordis.patch.yml");
      if (!fs.existsSync(patchPath)) return false;

      try {
        const content = fs.readFileSync(patchPath, "utf8");
        const doc = parseYaml(content);
        const entries = Array.isArray(doc) ? doc : [doc];

        const placement = step.placement ?? "insert";
        let found = false;

        if (placement === "insert" && Array.isArray(entries[0]?.insert)) {
          found = entries[0].insert.some((row: any) =>
            rowPresentSatisfied(step, row)
          );
        } else if (placement === "override") {
          found = entries.some((entry: any) =>
            typeof entry === "object" &&
            entry !== null &&
            entry.id === step.id &&
            rowPresentSatisfied(step, entry)
          );
        }

        return found;
      } catch {
        return false;
      }
    }

    case "settings-key-equals": {
      const file = step.file ?? "settings.yaml";
      const filePath = join(dshPath, file);
      if (!fs.existsSync(filePath)) return false;

      try {
        const content = fs.readFileSync(filePath, "utf8");
        const doc = parseYaml(content);

        let current = doc as any;
        for (const segment of step.key.split(".")) {
          if (current === null || typeof current !== "object") return false;
          current = current[segment];
        }

        return JSON.stringify(current) === JSON.stringify(step.value);
      } catch {
        return false;
      }
    }

    default:
      throw new Error(`unknown detect action: ${(step as any).action}`);
  }
}

/**
 * Detect whether a block is installed by running its detect steps.
 */
export function detectBlockStatus(
  block: Block,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): BlockDetection {
  const blockId = block.frontmatter.id;

  const allPass = block.frontmatter.detect.every((step) =>
    runDetectStep(step, dshPath, thursdayHome, fs)
  );

  if (!allPass) {
    return {
      blockId,
      status: "not-installed",
      shouldInstall: true,
      reason: "one or more detect steps failed",
    };
  }

  return {
    blockId,
    status: "installed-and-current",
    shouldInstall: false,
    reason: "all detect steps passed",
  };
}

/**
 * Plan which steps to run, in dependency order.
 */
export function planInstall(
  blocks: readonly Block[],
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): ExecutionPlan {
  const problems: InstallProblem[] = [];
  const steps: PlannedStep[] = [];

  try {
    const ordered = orderBlocks(blocks);

    for (const block of ordered) {
      const detection = detectBlockStatus(block, dshPath, thursdayHome, fs);

      if (!detection.shouldInstall) {
        continue;
      }

      for (let i = 0; i < block.frontmatter.steps.length; i++) {
        const step = block.frontmatter.steps[i];
        steps.push({
          blockId: block.frontmatter.id,
          blockRationale: block.frontmatter.rationale,
          index: i,
          step,
          dryRun: false,
        });
      }
    }

    return { steps, problems };
  } catch (err) {
    problems.push({
      message: `planning failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { steps, problems };
  }
}

/**
 * Execute a single install step.
 */
export async function executeStep(
  planned: PlannedStep,
  dshPath: string,
  thursdayHome: string,
  fs: FilesystemAPI,
): Promise<StepResult> {
  const { step, blockId, blockRationale } = planned;
  const output: string[] = [];

  try {
    switch (step.action) {
      case "pnpm-add": {
        const profile = step.profile ?? "web";
        const profilePath = join(dshPath, "profiles", profile);
        const spec = step.spec;
        const name = step.as ?? spec.split("/").pop()?.split("@")[0] ?? spec;

        const nodeModulesPath = join(profilePath, "node_modules", name);
        const alreadyInstalled = fs.existsSync(nodeModulesPath);

        if (!alreadyInstalled) {
          fs.mkdirSync(profilePath, { recursive: true });

          const storeDir = join(thursdayHome, "cache", "pnpm-store");
          fs.mkdirSync(storeDir, { recursive: true });

          if (step.allowBuilds) {
            const workspacePath = join(profilePath, "pnpm-workspace.yaml");
            let workspaceDoc: any = {};
            if (fs.existsSync(workspacePath)) {
              const content = fs.readFileSync(workspacePath, "utf8");
              workspaceDoc = parseYaml(content) || {};
            }

            if (!workspaceDoc.allowBuilds) {
              workspaceDoc.allowBuilds = [];
            }

            let allowBuildsEntry = "";
            if (spec.startsWith("github:")) {
              const parts = spec.slice(7).split("#");
              const [owner, repo] = parts[0].split("/");
              const ref = parts[1] ?? "main";
              const baseRepo = repo?.split("@")[0] ?? "";
              allowBuildsEntry = `${baseRepo}@https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
            } else {
              allowBuildsEntry = spec;
            }

            if (allowBuildsEntry && !workspaceDoc.allowBuilds.includes(allowBuildsEntry)) {
              workspaceDoc.allowBuilds.push(allowBuildsEntry);
              fs.writeFileSync(
                workspacePath,
                stringifyYaml(workspaceDoc),
                "utf8"
              );
              output.push(`Added allowBuilds entry: ${allowBuildsEntry}`);
            }
          }

          const env = {
            ...process.env,
            DSH_HOME: dshPath,
            THURSDAY_HOME: thursdayHome,
          };

          try {
            // Use execa for better error handling and testability
            await execa("pnpm", [
              "add",
              `--config.store-dir=${storeDir}`,
              spec,
              ...(step.as ? [`--save-as=${step.as}`] : []),
            ], {
              cwd: profilePath,
              env,
              stdio: "inherit",
            });

            output.push(`Installed package: ${spec}${step.as ? ` as ${step.as}` : ""}`);
            return {
              step: planned,
              changed: true,
              output: output.join("\n"),
            };
          } catch (err) {
            throw new Error(
              `pnpm-add failed for ${spec}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        } else {
          output.push(`Package already installed: ${name}`);
          return {
            step: planned,
            changed: false,
            output: output.join("\n"),
          };
        }
      }

      case "copy-tree": {
        const fromPath = join(dshPath, step.from);
        const toPath = join(dshPath, step.to);

        if (!fs.existsSync(fromPath)) {
          throw new Error(`source directory not found: ${fromPath}`);
        }

        fs.mkdirSync(toPath, { recursive: true });

        // Use fs.promises.cp with a filter callback for content comparison
        let copiedCount = 0;
        const result = await fs.promises.cp(fromPath, toPath, {
          recursive: true,
          force: false,
          filter: async (src) => {
            try {
              const dest = src.replace(fromPath, toPath);
              const destExists = fs.existsSync(dest);
              if (destExists) {
                const srcContent = await fs.promises.readFile(src);
                const destContent = await fs.promises.readFile(dest);
                const isSame = srcContent.equals(destContent);
                if (isSame) {
                  return false; // Skip copying if content is identical
                }
              }
              copiedCount++;
              return true;
            } catch {
              return true; // Copy on error
            }
          },
        });

        output.push(`Copied tree: ${step.from} → ${step.to} (${copiedCount} files changed)`);

        return {
          step: planned,
          changed: copiedCount > 0,
          output: output.join("\n"),
        };
      }

      case "patch-row": {
        output.push(`Would patch row: ${step.id} (placement: ${step.placement ?? "insert"})`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "disable-row": {
        output.push(`Would disable row: ${step.id}`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "enable-row": {
        output.push(`Would enable row: ${step.id}`);
        return {
          step: planned,
          changed: true,
          output: output.join("\n"),
        };
      }

      case "write-settings-key": {
        const file = step.file ?? "settings.yaml";
        const filePath = join(dshPath, file);

        fs.mkdirSync(dirname(filePath), { recursive: true });

        let doc: any = {};
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf8");
            doc = parseYaml(content) || {};
          } catch (err) {
            throw new Error(`failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const keyParts = step.key.split(".");
        let current = doc;
        for (let i = 0; i < keyParts.length - 1; i++) {
          const part = keyParts[i];
          if (!(part in current) || typeof current[part] !== "object") {
            current[part] = {};
          }
          current = current[part];
        }

        const lastKey = keyParts[keyParts.length - 1];
        const oldValue = current[lastKey];
        const newValue = step.value;

        const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

        if (changed) {
          current[lastKey] = newValue;
          fs.writeFileSync(filePath, stringifyYaml(doc), "utf8");
          output.push(`Set ${file}[${step.key}] = ${JSON.stringify(newValue)}`);
        } else {
          output.push(`${file}[${step.key}] already set correctly`);
        }

        return {
          step: planned,
          changed,
          output: output.join("\n"),
        };
      }

      case "run": {
        const cwd = step.cwd ? join(dshPath, step.cwd) : dshPath;

        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true });
        }

        const env = {
          ...process.env,
          DSH_HOME: dshPath,
          THURSDAY_HOME: thursdayHome,
        };

        try {
          const result = await execa(step.command, step.args ?? [], {
            cwd,
            env,
          });

          output.push(`Ran: ${step.command} ${(step.args ?? []).join(" ")}`);
          output.push(result.stdout || "");

          return {
            step: planned,
            changed: true,
            output: output.join("\n"),
          };
        } catch (err) {
          throw new Error(
            `command failed: ${step.command}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      default:
        throw new Error(`unknown install action: ${(step as any).action}`);
    }
  } catch (err) {
    throw new Error(
      `step ${planned.index} (${step.action}) in block ${blockId} failed: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Execute the installation plan.
 */
export async function executeInstall(
  plan: ExecutionPlan,
  dshPath: string,
  thursdayHome: string,
  options?: InstallOptions,
): Promise<InstallResult> {
  const dryRun = options?.dryRun ?? false;
  const quiet = options?.quiet ?? false;
  const fs = options?.fs ?? createFilesystemAPI();
  const results: StepResult[] = [];
  const problems: InstallProblem[] = [...plan.problems];

  if (!quiet) {
    console.log(
      `\nThursday install: ${plan.steps.length} steps to run${dryRun ? " (dry-run)" : ""}`
    );
  }

  for (const planned of plan.steps) {
    if (!quiet) {
      console.log(
        `\n[${planned.blockId}] ${planned.step.action} (step ${planned.index})`
      );
    }

    try {
      if (dryRun) {
        results.push({
          step: planned,
          changed: true,
          output: `[dry-run] would ${planned.step.action}`,
        });
        if (!quiet) {
          console.log(`  [dry-run] ${planned.step.action}...`);
        }
      } else {
        const result = await executeStep(planned, dshPath, thursdayHome, fs);
        results.push(result);
        if (!quiet) {
          console.log(`  ✓ ${result.step.step.action}`);
          if (result.output && !quiet) {
            console.log(`    ${result.output.split("\n").join("\n    ")}`);
          }
        }
      }
    } catch (err) {
      problems.push({
        block: planned.blockId,
        step: planned.index,
        message: err instanceof Error ? err.message : String(err),
      });
      if (!quiet) {
        console.error(`  ✗ error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const anyChanged = results.some((r) => r.changed);

  if (!quiet) {
    console.log(
      `\n${dryRun ? "Would install" : "Installed"}: ${results.length} steps, ` +
      `${results.filter((r) => r.changed).length} changed`
    );
  }

  return { steps: results, anyChanged, problems };
}

/**
 * Create the default filesystem API using Node.js fs module.
 */
export function createFilesystemAPI(): FilesystemAPI {
  return {
    existsSync: fsDefault.existsSync,
    readFileSync: fsDefault.readFileSync,
    writeFileSync: fsDefault.writeFileSync,
    mkdirSync: fsDefault.mkdirSync,
    promises: {
      readFile: fsPromisesDefault.readFile,
      writeFile: fsPromisesDefault.writeFile,
      mkdir: fsPromisesDefault.mkdir,
      cp: fsPromisesDefault.cp,
    },
  };
}

/**
 * High-level install executor.
 */
export async function install(
  blocks: readonly Block[],
  options?: InstallOptions,
): Promise<InstallResult> {
  const resolved = resolveThursdayHome();
  const thursdayHome = options?.thursdayHome ?? resolved.path;
  const dshPath = join(thursdayHome, "dsh");
  const fs = options?.fs ?? createFilesystemAPI();

  fs.mkdirSync(dshPath, { recursive: true });

  const plan = planInstall(blocks, dshPath, thursdayHome, fs);

  return executeInstall(plan, dshPath, thursdayHome, { ...options, fs });
}
