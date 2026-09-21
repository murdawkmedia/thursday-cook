/**
 * The one-time `~/.dsh` importer (ticket E1).
 *
 * SINGLE-MODULE RULE. This is the exactly-one module under `packages/` that
 * may construct a path into the user's dsh home: `resolveUserDshHome` below
 * is the only place that joins the home directory to the dsh home name or
 * reads the DSH_HOME override for the USER's home. A test
 * (`tests/wizard.test.ts`, "exactly one module") asserts no other file under
 * `packages/install/src/` contains that construction; `resolveThursdayHome`
 * in `install.ts` delegates here rather than spelling it again.
 *
 * READ-ONCE, COPY-NOT-LINK. The wizard may read the user's dsh home exactly
 * once, on request, to offer an import. Everything after the wizard exits must
 * behave identically with `~/.dsh` deleted, so the import produces a complete
 * copy: provider and profile configuration rendered into Thursday's own
 * `settings.yaml` (line-wise, via `settings-patch.ts` — the template is never
 * YAML round-tripped), plus a verbatim copy of `.credentials.yaml` carrying
 * mode 0600. No symlink, no include directive, no merge-at-startup, no
 * fallback read.
 *
 * NOT IMPORTABLE (deliberate): sessions, plugins, skills, storages,
 * attachments, input history and `auth/store.json` are never read. The code
 * below references exactly two source paths — `settings.yaml` and
 * `.credentials.yaml` — and nothing else under the user's home.
 */

import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { chmodSync as nodeChmodSync } from "node:fs";
import { parse as parseYaml } from "yaml";

import {
  patchAgentDefaultModel,
  patchRegion,
  renderChainsRegion,
  renderProvidersRegion,
  type SettingsProvider,
} from "./settings-patch";

/**
 * The filesystem surface the importer needs. `FilesystemAPI` from `install.ts`
 * satisfies it structurally (tests bind it to memfs); it is declared here so
 * this module imports nothing from the engine and the single-module rule stays
 * a one-directional dependency.
 */
export interface DshFs {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc?: "utf8") => string | Buffer;
  writeFileSync: (p: string, data: string | Buffer, enc?: "utf8") => void;
  mkdirSync: (p: string, opts?: { recursive: boolean }) => void;
  readdirSync: (p: string) => unknown[];
  statSync: (p: string) => { mode?: unknown };
}

/** Paths under the user's dsh home this module will never read. */
export const DSH_IMPORT_FORBIDDEN = [
  "sessions",
  "plugins",
  "skills",
  "storages",
  "attachments",
  "input-history.json",
  "auth",
] as const;

/**
 * Resolve the USER's dsh home: `$DSH_HOME`, else `~/.dsh`.
 *
 * This is the single construction site. Every other module that needs the
 * answer — the install guard, the wizard — calls this instead of joining the
 * segments itself.
 */
export function resolveUserDshHome(
  env?: Record<string, string | undefined>,
  homeDir?: string,
): string {
  const environment = env ?? process.env;
  const home = homeDir ?? homedir();
  const override = environment.DSH_HOME?.trim();
  return resolve(override && override !== "" ? override : join(home, ".dsh"));
}

/** Throw unless `p` resolves inside `home`. Every write goes through this. */
export function assertInsideHome(home: string, p: string, what: string): void {
  const realHome = resolve(home);
  const target = resolve(p);
  if (target !== realHome && !target.startsWith(realHome + sep)) {
    throw new Error(
      `refusing to write ${what}: ${target} is outside THURSDAY_HOME (${realHome}). ` +
        `The wizard writes only inside the Thursday home.`,
    );
  }
}

/** One dsh provider, secret-free exactly as dsh stores it. */
export interface ImportedProvider extends SettingsProvider {
  /** Model ids dsh already knows for this provider, if any. */
  knownModels: string[];
}

export interface AdoptedChains {
  personal?: { orchestrator: string[]; subagent: string[] };
  work?: { orchestrator: string[]; subagent: string[] };
}

export interface DshImportPreview {
  found: boolean;
  settingsPath: string;
  providers: ImportedProvider[];
  defaultModel: { provider: string; model: string } | null;
  adopted: AdoptedChains;
  /** dsh profile names that exist but are not personal/work string chains. */
  otherProfiles: string[];
  agentPresetDefault: string | null;
  hasCredentials: boolean;
  credentialsMode: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return value as string[];
}

/**
 * Read-only preview of what an import would copy, for the wizard to show
 * before asking. Reads `settings.yaml` and stats `.credentials.yaml` and
 * nothing else — in particular it never lists or opens any of
 * DSH_IMPORT_FORBIDDEN, so there is nothing to filter out later.
 */
export function previewDshImport(userDshHome: string, fs: DshFs): DshImportPreview {
  const settingsPath = join(userDshHome, "settings.yaml");
  const empty: DshImportPreview = {
    found: false,
    settingsPath,
    providers: [],
    defaultModel: null,
    adopted: {},
    otherProfiles: [],
    agentPresetDefault: null,
    hasCredentials: false,
    credentialsMode: null,
  };
  if (!fs.existsSync(settingsPath)) return empty;

  let doc: unknown;
  try {
    doc = parseYaml(fs.readFileSync(settingsPath, "utf8") as string);
  } catch {
    return empty;
  }
  if (!isRecord(doc)) return empty;

  // Providers: name, display, env-var key, endpoint. Secrets never appear here
  // because dsh stores apiKeyEnv (the NAME), not the value.
  const providers: ImportedProvider[] = [];
  const providerMap = isRecord(doc["llm-pi-ai"])
    ? (doc["llm-pi-ai"] as Record<string, unknown>).providers
    : undefined;
  if (isRecord(providerMap)) {
    for (const [name, entry] of Object.entries(providerMap)) {
      if (!isRecord(entry)) continue;
      const baseURL = entry.baseURL;
      if (typeof baseURL !== "string" || baseURL === "") continue;
      const models = Array.isArray(entry.models)
        ? entry.models
            .map((m) => (isRecord(m) && typeof m.id === "string" ? m.id : null))
            .filter((id): id is string => id !== null)
        : [];
      providers.push({
        name,
        displayName: typeof entry.displayName === "string" ? entry.displayName : name,
        apiKeyEnv: typeof entry.apiKeyEnv === "string" ? entry.apiKeyEnv : undefined,
        api: typeof entry.api === "string" ? entry.api : "openai-completions",
        baseURL,
        knownModels: models,
      });
    }
  }

  const agentDefault = doc["agent-default-model"];
  const defaultModel =
    isRecord(agentDefault) &&
    typeof agentDefault.provider === "string" &&
    typeof agentDefault.model === "string"
      ? { provider: agentDefault.provider, model: agentDefault.model }
      : null;

  // Profile chains: adopt only personal/work entries whose orchestrator and
  // subagent are string arrays — exactly the shape Thursday's chains region
  // can render. Anything else is reported, not guessed at.
  const adopted: AdoptedChains = {};
  const otherProfiles: string[] = [];
  const profile = doc.profile;
  if (isRecord(profile)) {
    for (const name of ["personal", "work"] as const) {
      const entry = profile[name];
      if (entry === undefined) continue;
      if (!isRecord(entry)) {
        otherProfiles.push(name);
        continue;
      }
      const orchestrator = stringArray(entry.orchestrator);
      const subagent = stringArray(entry.subagent);
      if (orchestrator === null || subagent === null) {
        otherProfiles.push(name);
        continue;
      }
      adopted[name] = { orchestrator, subagent };
    }
    for (const key of Object.keys(profile)) {
      if (key !== "personal" && key !== "work" && key !== "active" && key !== "chains") {
        otherProfiles.push(key);
      }
    }
  }

  const agentPresets = doc["agent-presets"];
  const agentPresetDefault =
    isRecord(agentPresets) && typeof agentPresets.default === "string"
      ? agentPresets.default
      : null;

  const credentialsPath = join(userDshHome, ".credentials.yaml");
  const hasCredentials = fs.existsSync(credentialsPath);
  let credentialsMode: number | null = null;
  if (hasCredentials) {
    try {
      const mode = (fs.statSync(credentialsPath) as { mode?: unknown }).mode;
      credentialsMode = typeof mode === "number" ? mode & 0o777 : null;
    } catch {
      credentialsMode = null;
    }
  }

  return {
    found: true,
    settingsPath,
    providers,
    defaultModel,
    adopted,
    otherProfiles,
    agentPresetDefault,
    hasCredentials,
    credentialsMode,
  };
}

export interface DshCopyOptions {
  /** Defaults to node:fs chmodSync; injected in tests to observe the mode. */
  chmod?: (path: string, mode: number) => void;
  /** Defaults to the current time; injected for deterministic receipts. */
  now?: () => string;
}

export interface DshCopyResult {
  copied: boolean;
  providers: string[];
  credentialsCopied: boolean;
  messages: string[];
}

const STALE_WARNING =
  `This copy is a point-in-time snapshot: rotating a key in dsh will NOT ` +
  `update Thursday. Re-run the import (or edit Thursday's copy) after rotation.`;

/**
 * Perform the accepted import. Every destination is asserted inside
 * `thursdayHome`; the user's home is only ever read. The credentials copy
 * carries mode 0600 rather than inheriting umask.
 */
export function copyDshImport(
  userDshHome: string,
  thursdayHome: string,
  dshPath: string,
  fs: DshFs,
  opts?: DshCopyOptions,
): DshCopyResult {
  const messages: string[] = [];
  const preview = previewDshImport(userDshHome, fs);
  if (!preview.found) {
    return { copied: false, providers: [], credentialsCopied: false, messages };
  }

  const settingsPath = join(dshPath, "settings.yaml");
  assertInsideHome(thursdayHome, settingsPath, "imported settings.yaml");
  if (!fs.existsSync(settingsPath)) {
    throw new Error(
      `cannot import: ${settingsPath} does not exist. The install writes the ` +
        `settings template before the wizard runs; the wizard never creates it.`,
    );
  }

  // The template is patched line-wise and never parsed here: parsing dsh's
  // OWN file above is a read, but round-tripping Thursday's template would
  // risk the `off:` key the template header warns about.
  let content = fs.readFileSync(settingsPath, "utf8") as string;

  if (preview.providers.length > 0) {
    content = patchRegion(
      content,
      "thursday-providers:begin",
      "thursday-providers:end",
      renderProvidersRegion(preview.providers),
    );
    messages.push(
      `imported ${preview.providers.length} provider(s): ${preview.providers.map((p) => p.name).join(", ")}`,
    );
  } else {
    messages.push(
      `dsh home has no providers with an endpoint; provider region left as the template.`,
    );
  }

  if (preview.defaultModel !== null) {
    content = patchAgentDefaultModel(
      content,
      preview.defaultModel.provider,
      preview.defaultModel.model,
    );
    messages.push(
      `default model follows dsh: ${preview.defaultModel.provider}/${preview.defaultModel.model}`,
    );
  }

  const adoptedNames = (Object.keys(preview.adopted) as (keyof AdoptedChains)[]).filter(
    (key) => preview.adopted[key] !== undefined,
  );
  if (adoptedNames.length > 0) {
    const first = preview.adopted[adoptedNames[0] as "personal"] ?? preview.adopted.work;
    if (first !== undefined) {
      content = patchRegion(
        content,
        "thursday-chains:begin",
        "thursday-chains:end",
        renderChainsRegion(first.orchestrator, first.subagent),
      );
      messages.push(`profile chains follow dsh (${adoptedNames.join(", ")}).`);
    }
  } else {
    messages.push(`no adoptable dsh profile chains; Thursday chains left as the template.`);
  }

  // Thursday composes its own presets (C2): dsh's preset default is reported,
  // never applied.
  if (preview.agentPresetDefault !== null) {
    messages.push(
      `dsh preset default is "${preview.agentPresetDefault}"; Thursday keeps its own preset.`,
    );
  }
  for (const other of preview.otherProfiles) {
    messages.push(`dsh profile "${other}" has no Thursday equivalent and was not imported.`);
  }

  fs.writeFileSync(settingsPath, content, "utf8");

  let credentialsCopied = false;
  if (preview.hasCredentials) {
    const src = join(userDshHome, ".credentials.yaml");
    const dest = join(dshPath, ".credentials.yaml");
    assertInsideHome(thursdayHome, dest, "imported .credentials.yaml");
    const bytes = fs.readFileSync(src) as string | Buffer;
    fs.writeFileSync(dest, bytes);
    (opts?.chmod ?? nodeChmodSync)(dest, 0o600);
    credentialsCopied = true;
    messages.push(`copied .credentials.yaml with mode 0600. ${STALE_WARNING}`);
  } else {
    messages.push(`no .credentials.yaml in the dsh home; nothing secret to copy. ${STALE_WARNING}`);
  }

  const receiptPath = join(thursdayHome, "state", "dsh-import.json");
  assertInsideHome(thursdayHome, receiptPath, "import receipt");
  fs.mkdirSync(join(thursdayHome, "state"), { recursive: true });
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        version: 1,
        at: (opts?.now ?? (() => new Date().toISOString()))(),
        providers: preview.providers.map((p) => p.name),
        credentialsMode: credentialsCopied ? "0600" : null,
        adoptedChains: adoptedNames,
        otherProfiles: preview.otherProfiles,
        staleWarning: STALE_WARNING,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    copied: true,
    providers: preview.providers.map((p) => p.name),
    credentialsCopied,
    messages,
  };
}
