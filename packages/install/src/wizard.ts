/**
 * The install wizard engine (ticket E1).
 *
 * The wizard configures what Thursday cannot guess — provider and profile
 * chains, the aidos durable scratch directory, and the AI scratch directory —
 * at the end of `thursday install`. It is safe to rerun (a second run reports
 * the existing configuration and changes nothing unasked) and writes only
 * inside the Thursday home.
 *
 * TESTABILITY. Every human answer, every network probe, and model discovery
 * arrives through the injected `WizardPrompts` / `WizardProbes`. The Deno
 * script in `wizards/thursday-setup.ts` supplies the interactive
 * implementations; the tests script them. Nothing here touches a TTY.
 *
 * MODEL DISCOVERY. The ticket names dsh's `llm.discoverModels(settingsNs,
 * request)` (`ctx.llm.discoverModels` on the host service). The engine takes
 * a `discover` function with the same contract — provider in, advertised
 * model ids out — so the call site that can reach `ctx.llm` passes it
 * through, and every other context degrades honestly to hand-typed
 * identifiers that are never presented as verified.
 *
 * NO AIDOS MODEL SETTING. The aidos reviewer falls back to the frontier chain
 * by default, so the wizard must not emit an aidos-specific model setting. The
 * writer below has no code path that produces one, and `hasAidosModelConfig`
 * plus a test assert the absence on the written bytes — because a passing
 * verdict here is what keeps reviews from silently running on a cheap model.
 */

import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  assertInsideHome,
  copyDshImport,
  previewDshImport,
  resolveUserDshHome,
  type DshFs,
  type DshImportPreview,
} from "./dsh-import";
import { describeMeridianVerdict, isUsable, verifyMeridianHealth } from "./meridian";
import {
  patchAgentDefaultModel,
  patchRegion,
  renderChainsRegion,
  renderProvidersRegion,
  type SettingsProvider,
} from "./settings-patch";
import { defaultAiScratchDir } from "./uninstall";

/** The free-provider chain, configured by default (matches the template). */
export const FREE_PROVIDER_NAME = "deepseek-official";
export const FREE_FRONTIER = "deepseek-official/deepseek-v4-pro";
export const FREE_FLASH = "deepseek-official/deepseek-v4-flash";

/** meridian's conventional local port (captured from meridian 1.66.0). */
export const MERIDIAN_DEFAULT_PORT = 9000;

/**
 * AIDOS SCRATCH WIRE POINT — READ THIS BEFORE EDITING.
 *
 * E1 forbids a second spelling of the aidos scratch path: the real default is
 * `dshHomePath("aidos", "scratch", workspaceKey)` (docs/dsh-home.md:378-381,
 * from `aidos/src/tools/scratch.ts`), and A6 may relocate it again. No single
 * recorded source exists yet in `packages/` or `config/` — the only spellings
 * are prose in docs/dsh-home.md and an inline recomputation inside the
 * fs-sandbox patch text in packages/blocks/dsh-runtime.md — so the wizard
 * takes the directory as an injected `aidosScratchDir` rather than computing
 * it. When A6 records the default as an importable constant, wire it at the
 * call site that builds `WizardRunOptions` (the Deno script and the CLI seam),
 * not here. Grep marker: AIDOS_SCRATCH_DEFAULT_UNWIRED.
 */
export const AIDOS_SCRATCH_WIRE_POINT =
  "WizardRunOptions.aidosScratchDir must come from A6's recorded default (AIDOS_SCRATCH_DEFAULT_UNWIRED)";

/**
 * PROVISIONAL fallback until A6 records the default. Anything calling this is
 * spelling the path a second time; prefer passing A6's constant through
 * `WizardRunOptions.aidosScratchDir` instead.
 */
export function provisionalAidosScratchDir(dshPath: string, workspaceKey: string): string {
  // AIDOS_SCRATCH_DEFAULT_UNWIRED: replace with A6's recorded default.
  return join(dshPath, "aidos", "scratch", workspaceKey);
}

/** One advertised model: the id is what goes into a chain route. */
export interface DiscoveredModel {
  id: string;
  name?: string;
}

/** Facts about the machine, not questions for the user. */
export interface WizardEnvironment {
  /** `command -v claude` succeeded: the trigger case for branch (a). */
  claudeInstalled: boolean;
  /** `command -v meridian` succeeded. */
  meridianBinInstalled: boolean;
}

export type ClaudeBranch = "setup" | "port" | "skip";

export interface MeridianSetupResult {
  installed: boolean;
  detail: string;
}

export interface WizardPrompts {
  /**
   * The Claude question, asked before the provider step. `offerSetup` is true
   * exactly in the trigger case (Claude present, meridian absent), where the
   * interactive script leads with branch (a) instead of asking cold.
   */
  askClaudeBranch: (offerSetup: boolean) => Promise<ClaudeBranch>;
  /** Best-effort meridian install; resolves even where setup is impossible. */
  installMeridian: () => Promise<MeridianSetupResult>;
  askPort: () => Promise<number>;
  askImport: (preview: DshImportPreview) => Promise<boolean>;
  /**
   * List what a configured provider offers. Rejects where the provider cannot
   * be interrogated (no network, rejected key, no listing endpoint) — the
   * engine treats rejection as the honest-degradation path, never as fatal.
   */
  discover: (providerName: string) => Promise<DiscoveredModel[]>;
  chooseFrontier: (routes: string[]) => Promise<string>;
  chooseFlash: (routes: string[], frontier: string) => Promise<string>;
  enterModelUnverified: (role: "frontier" | "flash") => Promise<string>;
  /**
   * A second provider is configured: offer a fallback rung. Resolves the full
   * `provider/model` route to append, or null to keep a single rung.
   */
  offerFallback: (routes: string[]) => Promise<string | null>;
}

export interface WizardProbes {
  /** Raw `GET /health` result for a candidate port; the caller does network. */
  probeMeridian: (port: number) => Promise<{ status: number; body: string }>;
}

export interface WizardRunOptions {
  thursdayHome: string;
  dshPath: string;
  fs: DshFs;
  env: WizardEnvironment;
  prompts: WizardPrompts;
  probes: WizardProbes;
  /** From A6's recorded default; see AIDOS_SCRATCH_WIRE_POINT. */
  aidosScratchDir: string;
  aiScratchDir?: string;
  /**
   * Defaults to `resolveUserDshHome()`; tests pass a memfs path. This is a
   * parameter, not a second construction site — the default still comes from
   * the one module that owns the spelling.
   */
  userDshHome?: string;
  /** Rerun that replaces the existing configuration instead of reporting it. */
  force?: boolean;
  now?: () => string;
  chmod?: (path: string, mode: number) => void;
}

export interface WizardRunResult {
  completed: boolean;
  changed: boolean;
  /** True when an existing configuration was reported and left alone. */
  rerun: boolean;
  frontier: string | null;
  flash: string | null;
  messages: string[];
}

export interface WizardReceipt {
  version: 1;
  frontier: string;
  flash: string;
  frontierChain: string[];
  flashChain: string[];
  verified: boolean;
  meridian: { port: number } | null;
  imported: boolean;
  aidosScratchDir: string;
  aiScratchDir: string;
  completedAt: string;
}

/**
 * True when settings text carries an aidos-specific model setting. The wizard
 * writer never produces one; this is the assertion the test holds against the
 * written bytes, because a second place to set the review model is how reviews
 * end up silently running on a cheap one.
 */
export function hasAidosModelConfig(settingsText: string): boolean {
  if (/^[ \t]*aidos[ \t]*:/m.test(settingsText)) return true;
  try {
    const doc = parseYaml(settingsText) as unknown;
    if (doc !== null && typeof doc === "object" && !Array.isArray(doc)) {
      return "aidos" in doc;
    }
  } catch {
    // Unparseable text is a different failure; absence is still absence.
  }
  return false;
}

function splitRoute(route: string): { provider: string; model: string } {
  const slash = route.indexOf("/");
  if (slash === -1) return { provider: route, model: route };
  return { provider: route.slice(0, slash), model: route.slice(slash + 1) };
}

function receiptPath(thursdayHome: string): string {
  return join(thursdayHome, "state", "wizard.json");
}

function readReceipt(fs: DshFs, thursdayHome: string): WizardReceipt | null {
  const path = receiptPath(thursdayHome);
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8") as string) as WizardReceipt;
  } catch {
    return null;
  }
}

/** Run the wizard. Pure orchestration over injected prompts and probes. */
export async function runWizard(opts: WizardRunOptions): Promise<WizardRunResult> {
  const { thursdayHome, dshPath, fs, env, prompts, probes } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const aiScratchDir = opts.aiScratchDir ?? defaultAiScratchDir();
  const messages: string[] = [];

  if (!opts.force) {
    const existing = readReceipt(fs, thursdayHome);
    if (existing !== null) {
      messages.push(
        `Install wizard already ran: frontier ${existing.frontier}, flash ${existing.flash}` +
          `${existing.meridian ? `, meridian on port ${existing.meridian.port}` : ""}` +
          `${existing.imported ? ", dsh configuration imported" : ""}. ` +
          `Nothing was changed; re-run with --force to configure again.`,
      );
      return {
        completed: true,
        changed: false,
        rerun: true,
        frontier: existing.frontier,
        flash: existing.flash,
        messages,
      };
    }
  }

  const settingsPath = join(dshPath, "settings.yaml");
  assertInsideHome(thursdayHome, settingsPath, "settings.yaml");
  if (!fs.existsSync(settingsPath)) {
    throw new Error(
      `cannot run the wizard: ${settingsPath} does not exist. The install writes the ` +
        `settings template before the wizard runs; the wizard never creates it.`,
    );
  }

  // ── The Claude question, before the provider step. ──
  const providers: SettingsProvider[] = [];
  let meridian: { port: number } | null = null;
  const offerSetup = env.claudeInstalled && !env.meridianBinInstalled;
  if (offerSetup) {
    messages.push(
      `Found a Claude installation but no meridian: branch (a) below sets meridian up ` +
        `against that subscription.`,
    );
  }
  const branch = await prompts.askClaudeBranch(offerSetup);
  if (branch === "setup") {
    const setup = await prompts.installMeridian();
    if (setup.installed) {
      const probe = await probes.probeMeridian(MERIDIAN_DEFAULT_PORT);
      const verdict = verifyMeridianHealth(probe.status, probe.body);
      if (isUsable(verdict)) {
        meridian = { port: MERIDIAN_DEFAULT_PORT };
        messages.push(describeMeridianVerdict(verdict, MERIDIAN_DEFAULT_PORT));
      } else {
        messages.push(
          `meridian was installed, but ${describeMeridianVerdict(verdict, MERIDIAN_DEFAULT_PORT)} ` +
            `It was NOT written into the configuration.`,
        );
      }
    } else {
      messages.push(
        `meridian could not be set up here: ${setup.detail} ` +
          `Setup still completes on the free-provider path below; retry branch (a) any time.`,
      );
    }
  } else if (branch === "port") {
    const port = await prompts.askPort();
    const probe = await probes.probeMeridian(port);
    const verdict = verifyMeridianHealth(probe.status, probe.body);
    if (isUsable(verdict)) {
      meridian = { port };
      messages.push(describeMeridianVerdict(verdict, port));
    } else {
      // A refusal that does not say what to do next costs the next five
      // minutes; the verdict text names its own remedy.
      messages.push(
        `${describeMeridianVerdict(verdict, port)} The port was NOT written into ` +
          `the configuration; setup continues on the free-provider path.`,
      );
    }
  } else {
    messages.push(`Skipped meridian; setup continues on the free-provider path.`);
  }
  if (meridian !== null) {
    providers.push({
      name: "meridian",
      displayName: "meridian (Claude subscription)",
      api: "openai-completions",
      baseURL: `http://127.0.0.1:${meridian.port}`,
    });
  }

  // ── One-time import, only on request. ──
  const userDshHome = opts.userDshHome ?? resolveUserDshHome();
  const preview = previewDshImport(userDshHome, fs);
  let imported = false;
  if (preview.found) {
    messages.push(
      `Found an existing dsh configuration (${preview.providers.length} provider(s): ` +
        `${preview.providers.map((p) => p.name).join(", ") || "none"}).`,
    );
    if (await prompts.askImport(preview)) {
      const result = copyDshImport(userDshHome, thursdayHome, dshPath, fs, {
        chmod: opts.chmod,
        now,
      });
      imported = result.copied;
      messages.push(...result.messages);
      for (const name of result.providers) {
        if (!providers.some((p) => p.name === name) && name !== "meridian") {
          const found = preview.providers.find((p) => p.name === name);
          if (found !== undefined) providers.push(found);
        }
      }
    } else {
      messages.push(
        `Skipped the import: with no import taken, this install is byte-identical to one ` +
          `on a machine with no dsh home.`,
      );
    }
  }

  // ── Frontier and flash: two questions, however many providers exist. ──
  // A successful listing proves the credential works AND the model exists;
  // that double duty is why discovery is also the check.
  const discovered = new Map<string, DiscoveredModel[]>();
  for (const provider of [{ name: FREE_PROVIDER_NAME }, ...providers]) {
    try {
      const models = await prompts.discover(provider.name);
      if (models.length > 0) {
        discovered.set(provider.name, models);
        messages.push(
          `discovery for ${provider.name}: ${models.length} model(s) listed, ` +
            `so the credential works and those identifiers exist.`,
        );
      } else {
        messages.push(`discovery for ${provider.name} listed nothing; treated as failed.`);
      }
    } catch (err) {
      messages.push(
        `discovery for ${provider.name} failed (${err instanceof Error ? err.message : String(err)}); ` +
          `that provider's models will be typed by hand, unverified.`,
      );
    }
  }

  const routes: string[] = [];
  for (const [provider, models] of discovered) {
    for (const model of models) routes.push(`${provider}/${model.id}`);
  }

  let frontier: string;
  let flash: string;
  let verified: boolean;
  if (routes.length === 0) {
    // Honest degradation: hand-typed identifiers, plainly stated unverified.
    frontier = await prompts.enterModelUnverified("frontier");
    flash = await prompts.enterModelUnverified("flash");
    verified = false;
    messages.push(
      `No provider could be listed, so "${frontier}" and "${flash}" were typed by hand ` +
        `and could NOT be verified. Check both identifiers before relying on them.`,
    );
  } else {
    frontier = await prompts.chooseFrontier(routes);
    flash = await prompts.chooseFlash(routes, frontier);
    verified = true;
  }

  if (frontier === flash) {
    messages.push(
      `Frontier and flash are the same model (${frontier}): accepted, and it means ` +
        `subagents will cost the same as the orchestrator — the cheap/best split is off.`,
    );
  }

  // ── Chains, not single models. ──
  const frontierChain = [frontier];
  const flashChain = [flash];
  const providerNames = new Set(
    [...frontierChain, ...flashChain].map((r) => splitRoute(r).provider),
  );
  for (const p of providers.map((p) => p.name)) providerNames.add(p);
  providerNames.add(FREE_PROVIDER_NAME);
  if (providerNames.size > 1) {
    const fallback = await prompts.offerFallback(routes);
    if (fallback !== null && fallback !== "") {
      frontierChain.push(fallback);
      flashChain.push(fallback);
      messages.push(`fallback rung added to both chains: ${fallback}.`);
    } else {
      messages.push(
        `Both chains are single-rung: no failover. A second provider is configured, ` +
          `so a fallback rung was offered and declined.`,
      );
    }
  } else {
    messages.push(
      `Both chains are single-rung: no failover, because no second provider is configured.`,
    );
  }

  // ── Write: chains region, providers region, default model, receipt. ──
  let content = fs.readFileSync(settingsPath, "utf8") as string;
  if (providers.length > 0) {
    content = patchRegion(
      content,
      "thursday-providers:begin",
      "thursday-providers:end",
      renderProvidersRegion(providers),
    );
  } else {
    messages.push(
      `Free-provider default kept: ${FREE_PROVIDER_NAME} needs no account and no key, ` +
        `so a user with no paid account finishes setup with a working session.`,
    );
  }
  content = patchRegion(
    content,
    "thursday-chains:begin",
    "thursday-chains:end",
    renderChainsRegion(frontierChain, flashChain),
  );
  const head = splitRoute(frontierChain[0] ?? frontier);
  content = patchAgentDefaultModel(content, head.provider, head.model);
  if (hasAidosModelConfig(content)) {
    // Unreachable by construction — the writer above has no aidos path — but
    // a second model-setting site must fail loudly, never silently.
    throw new Error(`refusing to write settings with an aidos model setting.`);
  }
  fs.writeFileSync(settingsPath, content, "utf8");

  // ── Scratch directories. ──
  assertInsideHome(thursdayHome, opts.aidosScratchDir, "aidos scratch directory");
  fs.mkdirSync(opts.aidosScratchDir, { recursive: true });
  messages.push(`aidos durable scratch: ${opts.aidosScratchDir} (from A6's recorded default).`);
  try {
    assertInsideHome(thursdayHome, aiScratchDir, "AI scratch directory");
    fs.mkdirSync(aiScratchDir, { recursive: true });
    messages.push(`AI scratch: ${aiScratchDir}.`);
  } catch {
    // The E2 AI scratch lives outside the home; the wizard records the path
    // but never writes there — E6's half of the promise.
    messages.push(
      `AI scratch is ${aiScratchDir}, outside the Thursday home, so the wizard records ` +
        `it but does not create it.`,
    );
  }

  const receipt: WizardReceipt = {
    version: 1,
    frontier,
    flash,
    frontierChain,
    flashChain,
    verified,
    meridian,
    imported,
    aidosScratchDir: opts.aidosScratchDir,
    aiScratchDir,
    completedAt: now(),
  };
  const receiptDest = receiptPath(thursdayHome);
  assertInsideHome(thursdayHome, receiptDest, "wizard receipt");
  fs.mkdirSync(join(thursdayHome, "state"), { recursive: true });
  fs.writeFileSync(receiptDest, JSON.stringify(receipt, null, 2), "utf8");

  messages.push(
    `Wizard complete: frontier ${frontier} feeds the orchestrator, flash ${flash} feeds ` +
      `subagents${verified ? "" : " (UNVERIFIED — see above)"}.`,
  );
  return { completed: true, changed: true, rerun: false, frontier, flash, messages };
}
