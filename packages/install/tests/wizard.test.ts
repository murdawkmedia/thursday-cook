import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { readdirSync as nodeReaddirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fs as memfsFs, vol } from "memfs";
import { parse as parseYaml } from "yaml";

import { copyDshImport, previewDshImport, type DshFs } from "../src/dsh-import";
import {
  hasAidosModelConfig,
  runWizard,
  FREE_FLASH,
  FREE_FRONTIER,
  FREE_PROVIDER_NAME,
  type ClaudeBranch,
  type WizardPrompts,
  type WizardRunOptions,
} from "../src/wizard";
import { createFilesystemAPI } from "../src/install";
import { patchRegion, renderChainsRegion } from "../src/settings-patch";

/**
 * E1 wizard tests: behavior plus the three enforcement rules.
 *
 * Every run below is scripted — no TTY, no network. The probes answer from
 * literals (the real captured meridian body lives in meridian.test.ts; the
 * byte sums here are its distinguishing fields), and the filesystem is memfs
 * except for the 0600 test, which needs real modes and uses a tmpdir exactly
 * like settings-template.test.ts does.
 */

const REAL_HEALTH = JSON.stringify({
  status: "healthy",
  version: "1.66.0",
  auth: { loggedIn: true, subscriptionType: "max", daysUntilRenewal: 22 },
  claudeExecutable: { path: "/bin/claude" },
});
const IMPOSTOR = JSON.stringify({ status: "healthy" });

const FIXED_NOW = "2026-09-21T00:00:00.000Z";

function templateText(): string {
  const configDir = fileURLToPath(new URL("../../../config", import.meta.url));
  return readFileSync(join(configDir, "settings.yaml"), "utf8");
}

function memfsApi(): DshFs {
  const mfs = memfsFs as any;
  const api = {
    existsSync: mfs.existsSync.bind(mfs),
    readFileSync: mfs.readFileSync.bind(mfs),
    writeFileSync: mfs.writeFileSync.bind(mfs),
    mkdirSync: mfs.mkdirSync.bind(mfs),
    readdirSync: mfs.readdirSync.bind(mfs),
    statSync: mfs.statSync.bind(mfs),
  };
  return api as unknown as DshFs;
}

let homeSeq = 0;

interface Harness {
  fs: DshFs;
  home: string;
  dsh: string;
  userDsh: string;
  writes: string[];
  mkdirs: string[];
  reads: string[];
  chmods: Array<{ path: string; mode: number }>;
  /**
   * Unwrapped writes: fixture setup only (template install, decoy seeding,
   * marker planting). The recorded arrays must contain wizard-run effects and
   * nothing else — otherwise the home-guard test indicts the setup and the
   * marker test reads back its own planted files.
   */
  raw: Pick<DshFs, "writeFileSync" | "mkdirSync">;
}

/** memfs home with the real settings template installed and writes recorded. */
function makeHarness(): Harness {
  homeSeq += 1;
  const fs = memfsApi();
  const home = `/wizard-home-${homeSeq}`;
  const dsh = join(home, "dsh");
  const userDsh = `/wizard-userdsh-${homeSeq}`;
  const writes: string[] = [];
  const mkdirs: string[] = [];
  const reads: string[] = [];
  const chmods: Array<{ path: string; mode: number }> = [];
  const rawRead = fs.readFileSync.bind(fs);
  const rawWrite = fs.writeFileSync.bind(fs);
  const rawMkdir = fs.mkdirSync.bind(fs);
  const raw = { writeFileSync: rawWrite, mkdirSync: rawMkdir };
  fs.readFileSync = ((p: string, enc?: "utf8") => {
    reads.push(p);
    return (rawRead as any)(p, enc);
  }) as DshFs["readFileSync"];
  fs.writeFileSync = ((p: string, data: string | Buffer, enc?: "utf8") => {
    writes.push(p);
    return (rawWrite as any)(p, data, enc);
  }) as DshFs["writeFileSync"];
  fs.mkdirSync = ((p: string, opts?: { recursive: boolean }) => {
    mkdirs.push(p);
    return (rawMkdir as any)(p, opts);
  }) as DshFs["mkdirSync"];
  rawMkdir(dsh, { recursive: true });
  (rawWrite as any)(join(dsh, "settings.yaml"), templateText(), "utf8");
  return {
    fs,
    home,
    dsh,
    userDsh,
    writes,
    mkdirs,
    reads,
    chmods,
    raw,
  };
}

function seedUserDsh(h: Harness, settings: string, credentials?: string): void {
  h.raw.mkdirSync(h.userDsh, { recursive: true });
  (h.raw.writeFileSync as any)(join(h.userDsh, "settings.yaml"), settings, "utf8");
  if (credentials !== undefined) {
    (h.raw.writeFileSync as any)(join(h.userDsh, ".credentials.yaml"), credentials);
  }
}

const DECOY_SETTINGS = `agent-default-model:
  provider: decoy-provider
  model: decoy-model
agent-presets:
  default: decoy
llm-pi-ai:
  providers:
    decoy-provider:
      displayName: Decoy Provider
      apiKeyEnv: DECOY_API_KEY
      api: openai-completions
      baseURL: https://decoy.invalid/v1
profile:
  active: personal
  personal:
    orchestrator:
    - decoy-provider/decoy-model
    subagent:
    - decoy-provider/decoy-cheap
`;

interface Script {
  branch?: ClaudeBranch;
  offerSetupSeen?: boolean;
  port?: number;
  askImport?: boolean;
  frontier?: string;
  flash?: string;
  discover?: Record<string, { id: string }[]>;
  discoverFails?: boolean;
  fallback?: string | null;
  meridianSetup?: { installed: boolean; detail: string };
}

function scriptPrompts(s: Script): WizardPrompts {
  return {
    askClaudeBranch: async (offerSetup) => {
      s.offerSetupSeen = offerSetup;
      return s.branch ?? "skip";
    },
    installMeridian: async () => s.meridianSetup ?? { installed: false, detail: "no network" },
    askPort: async () => s.port ?? 9000,
    askImport: async () => s.askImport ?? false,
    discover: async (provider) => {
      if (s.discoverFails ?? true) throw new Error("no listing endpoint");
      return s.discover?.[provider] ?? [];
    },
    chooseFrontier: async (routes) => s.frontier ?? routes[0]!,
    chooseFlash: async (routes) => s.flash ?? routes[1] ?? routes[0]!,
    enterModelUnverified: async (role) =>
      role === "frontier" ? (s.frontier ?? FREE_FRONTIER) : (s.flash ?? FREE_FLASH),
    offerFallback: async () => s.fallback ?? null,
  };
}

function baseOpts(h: Harness, s: Script, extra?: Partial<WizardRunOptions>): WizardRunOptions {
  return {
    thursdayHome: h.home,
    dshPath: h.dsh,
    fs: h.fs,
    env: { claudeInstalled: false, meridianBinInstalled: false },
    prompts: scriptPrompts(s),
    probes: { probeMeridian: async () => ({ status: 500, body: "" }) },
    aidosScratchDir: join(h.dsh, "aidos", "scratch", "--key--"),
    aiScratchDir: "/outside-home/.ai-scratch",
    userDshHome: h.userDsh,
    now: () => FIXED_NOW,
    chmod: (path, mode) => {
      h.chmods.push({ path, mode });
    },
    ...extra,
  };
}

function readSettings(h: Harness): string {
  return h.fs.readFileSync(join(h.dsh, "settings.yaml"), "utf8") as string;
}

beforeEach(() => {
  vol.reset();
});

describe("E1 enforcement: exactly one module constructs the user dsh home path", () => {
  it("only dsh-import.ts builds the user dsh home path anywhere in packages/", () => {
    const packagesDir = fileURLToPath(new URL("../../", import.meta.url));
    // Frozen pre-existing spellings. Three are genuine path constructions
    // outside this ticket's allowlist (session x2, cli); the fourth is a
    // benign fixture — a directory skip-list entry in the tokens tests, not a
    // path into anyone's home. Each is listed explicitly so a NEW file with a
    // quoted home segment fails this test instead of blending in.
    const FROZEN = new Set([
      "session/src/runtime.mjs",
      "session/src/doctor.mjs",
      "cli/src/index.ts",
      "tokens/tests/tokens.test.ts",
    ]);
    const hits: string[] = [];
    const walk = (dir: string): void => {
      const entries = nodeReaddirSync(dir, { withFileTypes: true }) as unknown as Array<{
        name: string;
        isDirectory: () => boolean;
      }>;
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|mjs|js|yml|yaml)$/.test(entry.name)) continue;
        // Any quote style around the home segment: single, double, template.
        if (/([\'"`])\.dsh\1/.test(readFileSync(full, "utf8"))) {
          // Normalize against a missing trailing slash: fileURLToPath keeps
          // the directory URL's slash, but this must not depend on that.
          const rel = full
            .slice(full.startsWith(packagesDir) ? packagesDir.length : 0)
            .replace(/^\/+/, "");
          if (!FROZEN.has(rel)) hits.push(rel);
        }
      }
    };
    walk(packagesDir);
    expect(hits).toEqual(["install/src/dsh-import.ts"]);
  });
});

describe("E1 enforcement: no aidos model setting is ever written", () => {
  it("a full run writes chains but no aidos key, asserted on the bytes", async () => {
    const h = makeHarness();
    const s: Script = {
      discoverFails: false,
      discover: { [FREE_PROVIDER_NAME]: [{ id: "pro" }, { id: "flash" }] },
    };
    const result = await runWizard(baseOpts(h, s));
    expect(result.completed).toBe(true);
    const text = readSettings(h);
    expect(hasAidosModelConfig(text)).toBe(false);
    const doc = parseYaml(text) as Record<string, unknown>;
    expect("aidos" in doc).toBe(false);
  });
});

describe("E1: orchestrator rides frontier, subagents ride flash (read back)", () => {
  it("the written configuration resolves as the ticket requires", async () => {
    const h = makeHarness();
    const s: Script = {
      discoverFails: false,
      discover: { [FREE_PROVIDER_NAME]: [{ id: "think-pro" }, { id: "bulk-flash" }] },
    };
    const result = await runWizard(baseOpts(h, s));
    const doc = parseYaml(readSettings(h)) as any;
    const frontier = `${FREE_PROVIDER_NAME}/think-pro`;
    const flash = `${FREE_PROVIDER_NAME}/bulk-flash`;
    expect(result.frontier).toBe(frontier);
    expect(result.flash).toBe(flash);
    // profile.personal.orchestrator is the CHAIN NAME, not the routes: the
    // routes live under profile.chains[name]. Asserting on the name string
    // indexed [0] reads one character ("p") and proves nothing.
    const orchChain = doc.profile.personal.orchestrator as string;
    const subChain = doc.profile.personal.subagent as string;
    expect(doc.profile.chains[orchChain][0]).toBe(frontier);
    expect(doc.profile.chains[subChain][0]).toBe(flash);
    expect(doc["agent-default-model"]).toEqual({
      provider: FREE_PROVIDER_NAME,
      model: "think-pro",
    });
  });
});

describe("E1: free-provider default path", () => {
  it("a user with no paid account finishes setup on the template providers", async () => {
    const h = makeHarness();
    const result = await runWizard(baseOpts(h, {}));
    expect(result.completed).toBe(true);
    const text = readSettings(h);
    // Providers region untouched: the template placeholder is still there.
    expect(text).toContain("Example provider (replace at install time)");
    expect(result.messages.join("\n")).toContain("Free-provider default kept");
  });
});

describe("E1: discovery and honest degradation", () => {
  it("a listing proves the credential and the model; the choice is recorded verified", async () => {
    const h = makeHarness();
    const s: Script = {
      discoverFails: false,
      discover: { [FREE_PROVIDER_NAME]: [{ id: "pro" }, { id: "flash" }] },
    };
    const result = await runWizard(baseOpts(h, s));
    expect(result.messages.join("\n")).toContain("the credential works");
    const receipt = JSON.parse(
      h.fs.readFileSync(join(h.home, "state", "wizard.json"), "utf8") as string,
    );
    expect(receipt.verified).toBe(true);
  });

  it("failed discovery degrades to hand-typed identifiers stated as unverified", async () => {
    const h = makeHarness();
    const s: Script = {
      frontier: "deepseek-official/hand-pro",
      flash: "deepseek-official/hand-flash",
    };
    const result = await runWizard(baseOpts(h, s));
    expect(result.frontier).toBe("deepseek-official/hand-pro");
    expect(result.messages.join("\n")).toContain("could NOT be verified");
    const receipt = JSON.parse(
      h.fs.readFileSync(join(h.home, "state", "wizard.json"), "utf8") as string,
    );
    expect(receipt.verified).toBe(false);
  });

  it("no path writes an unverified identifier without saying so", async () => {
    const h = makeHarness();
    await runWizard(baseOpts(h, {}));
    const receipt = JSON.parse(
      h.fs.readFileSync(join(h.home, "state", "wizard.json"), "utf8") as string,
    );
    expect(receipt.verified).toBe(false);
  });
});

describe("E1: chains, not single models", () => {
  it("a single rung is reported as having no failover", async () => {
    const h = makeHarness();
    const result = await runWizard(baseOpts(h, {}));
    const text = readSettings(h);
    expect(text).toContain("- deepseek-official/deepseek-v4-pro");
    // The route line alone does not prove the message: assert the words.
    expect(result.messages.join("\n")).toContain("no failover");
  });

  it("the same model twice is accepted and its meaning is stated", async () => {
    const h = makeHarness();
    const s: Script = {
      discoverFails: false,
      discover: { [FREE_PROVIDER_NAME]: [{ id: "only" }] },
      frontier: `${FREE_PROVIDER_NAME}/only`,
      flash: `${FREE_PROVIDER_NAME}/only`,
    };
    const result = await runWizard(baseOpts(h, s));
    expect(result.messages.join("\n")).toContain("will cost the same as the orchestrator");
  });

  it("a fallback rung is offered where a second provider exists, and appended when taken", async () => {
    const h = makeHarness();
    const s: Script = {
      branch: "port",
      port: 9000,
      discoverFails: false,
      discover: {
        [FREE_PROVIDER_NAME]: [{ id: "pro" }, { id: "flash" }],
        meridian: [{ id: "sonnet" }],
      },
      fallback: "meridian/sonnet",
    };
    const result = await runWizard(
      baseOpts(h, s, {
        probes: { probeMeridian: async () => ({ status: 200, body: REAL_HEALTH }) },
      }),
    );
    expect(result.messages.join("\n")).toContain("fallback rung added");
    const doc = parseYaml(readSettings(h)) as any;
    // Same chain-name indirection as above: the routes are under
    // profile.chains[personal.orchestrator], not on the profile entry.
    expect(doc.profile.chains[doc.profile.personal.orchestrator]).toContain("meridian/sonnet");
  });
});

describe("E1: meridian branches", () => {
  it("branch (b) refuses a port that does not identify, and writes nothing", async () => {
    const h = makeHarness();
    const s: Script = { branch: "port", port: 9999 };
    const result = await runWizard(
      baseOpts(h, s, {
        probes: { probeMeridian: async () => ({ status: 200, body: IMPOSTOR }) },
      }),
    );
    expect(result.messages.join("\n")).toContain("NOT written");
    expect(readSettings(h)).not.toContain("meridian");
  });

  it("branch (b) accepts a verified meridian and writes it", async () => {
    const h = makeHarness();
    const s: Script = {
      branch: "port",
      port: 9000,
      discoverFails: false,
      discover: { meridian: [{ id: "sonnet" }] },
    };
    const result = await runWizard(
      baseOpts(h, s, {
        probes: { probeMeridian: async () => ({ status: 200, body: REAL_HEALTH }) },
      }),
    );
    expect(result.messages.join("\n")).toContain("meridian");
    const text = readSettings(h);
    expect(text).toContain("http://127.0.0.1:9000");
    const receipt = JSON.parse(
      h.fs.readFileSync(join(h.home, "state", "wizard.json"), "utf8") as string,
    );
    expect(receipt.meridian).toEqual({ port: 9000 });
  });

  it("branch (a) that cannot install degrades to the free path with exact steps", async () => {
    const h = makeHarness();
    const s: Script = {
      branch: "setup",
      meridianSetup: { installed: false, detail: "unsupported platform" },
    };
    const result = await runWizard(baseOpts(h, s));
    expect(result.completed).toBe(true);
    expect(result.messages.join("\n")).toContain("free-provider path");
    expect(readSettings(h)).not.toContain("meridian");
  });

  it("branch (a) success installs, verifies the default port, and writes meridian", async () => {
    const h = makeHarness();
    const s: Script = {
      branch: "setup",
      meridianSetup: { installed: true, detail: "installed" },
      discoverFails: false,
      discover: { meridian: [{ id: "sonnet" }] },
    };
    const result = await runWizard(
      baseOpts(h, s, {
        probes: { probeMeridian: async () => ({ status: 200, body: REAL_HEALTH }) },
      }),
    );
    expect(result.completed).toBe(true);
    expect(result.messages.join("\n")).toContain("signed in");
    const text = readSettings(h);
    expect(text).toContain("http://127.0.0.1:9000");
    const receipt = JSON.parse(
      h.fs.readFileSync(join(h.home, "state", "wizard.json"), "utf8") as string,
    );
    expect(receipt.meridian).toEqual({ port: 9000 });
  });

  it("Claude installed without meridian offers the setup rather than asking cold", async () => {
    const h = makeHarness();
    const s: Script = {};
    await runWizard(
      baseOpts(h, s, { env: { claudeInstalled: true, meridianBinInstalled: false } }),
    );
    expect(s.offerSetupSeen).toBe(true);
  });

  it("without Claude the question is still asked, but not as an offer", async () => {
    const h = makeHarness();
    const s: Script = {};
    await runWizard(baseOpts(h, s));
    expect(s.offerSetupSeen).toBe(false);
  });
});

describe("E1: rerun is a no-op that reports existing config", () => {
  it("the second run changes nothing and names what exists", async () => {
    const h = makeHarness();
    const first = await runWizard(baseOpts(h, {}));
    expect(first.changed).toBe(true);
    const before = readSettings(h);
    const second = await runWizard(baseOpts(h, {}));
    expect(second.rerun).toBe(true);
    expect(second.changed).toBe(false);
    expect(readSettings(h)).toBe(before);
    expect(second.messages.join("\n")).toContain("already ran");
  });
});

describe("E1: every written path is inside the Thursday home", () => {
  it("a full run with import and meridian never escapes, and never creates the AI scratch", async () => {
    const h = makeHarness();
    seedUserDsh(h, DECOY_SETTINGS, "DECOY_API_KEY: secret\n");
    const s: Script = {
      branch: "port",
      port: 9000,
      askImport: true,
      discoverFails: false,
      discover: {
        [FREE_PROVIDER_NAME]: [{ id: "pro" }, { id: "flash" }],
        "decoy-provider": [{ id: "decoy-model" }],
      },
      fallback: null,
    };
    await runWizard(
      baseOpts(h, s, {
        probes: { probeMeridian: async () => ({ status: 200, body: REAL_HEALTH }) },
      }),
    );
    const inside = (p: string) => p === h.home || p.startsWith(h.home + "/");
    for (const p of [...h.writes, ...h.mkdirs]) expect(inside(p)).toBe(true);
    // The outside AI scratch is recorded, never created.
    expect(h.mkdirs).not.toContain("/outside-home/.ai-scratch");
    expect(h.writes.every((p) => !p.startsWith(h.userDsh))).toBe(true);
  });
});

describe("E1: import is read-only, complete, and consented", () => {
  it("without consent the install is byte-identical to a machine with no dsh home", async () => {
    const withDecoy = makeHarness();
    seedUserDsh(withDecoy, DECOY_SETTINGS, "DECOY_API_KEY: secret\n");
    await runWizard(baseOpts(withDecoy, { askImport: false }));
    const withoutDecoy = makeHarness();
    await runWizard({
      ...baseOpts(withoutDecoy, { askImport: false }),
      userDshHome: join(withoutDecoy.home, "no-such-dsh"),
    });
    expect(readSettings(withDecoy)).toBe(readSettings(withoutDecoy));
  });

  it("an accepted import lists providers by name and copies credentials at 0600", async () => {
    const h = makeHarness();
    seedUserDsh(h, DECOY_SETTINGS, "DECOY_API_KEY: secret\n");
    const result = await runWizard(baseOpts(h, { askImport: true }));
    expect(result.messages.join("\n")).toContain("decoy-provider");
    expect(result.messages.join("\n")).toContain("point-in-time snapshot");
    // The decoy chains are read but not applied: the frontier/flash answers
    // own the chains region, and the message must say so honestly.
    expect(result.messages.join("\n")).toContain("own the chains region");
    expect(h.chmods).toContainEqual({ path: join(h.dsh, ".credentials.yaml"), mode: 0o600 });
    expect(h.fs.readFileSync(join(h.dsh, ".credentials.yaml"), "utf8")).toContain("DECOY_API_KEY");
  });

  it("the import never reads sessions, plugins, skills, storages, attachments, history or auth", async () => {
    const h = makeHarness();
    seedUserDsh(h, DECOY_SETTINGS, "x: y\n");
    for (const dir of ["sessions", "plugins", "skills", "storages", "attachments", "auth"]) {
      h.raw.mkdirSync(join(h.userDsh, dir), { recursive: true });
      (h.raw.writeFileSync as any)(
        join(h.userDsh, dir, "marker.txt"),
        "MARKER-SHOULD-NEVER-MOVE",
        "utf8",
      );
    }
    (h.raw.writeFileSync as any)(
      join(h.userDsh, "input-history.json"),
      "MARKER-SHOULD-NEVER-MOVE",
      "utf8",
    );
    await runWizard(baseOpts(h, { askImport: true }));
    const forbidden = [
      "sessions",
      "plugins",
      "skills",
      "storages",
      "attachments",
      "input-history",
      "/auth",
    ];
    for (const p of h.reads) {
      expect(forbidden.some((seg) => p.includes(seg))).toBe(false);
    }
    const thursdayFiles = [...h.writes];
    for (const p of thursdayFiles) {
      const body = h.fs.readFileSync(p) as string | Buffer;
      expect(String(body)).not.toContain("MARKER-SHOULD-NEVER-MOVE");
    }
  });

  it("preview names providers without touching secrets", () => {
    const h = makeHarness();
    seedUserDsh(h, DECOY_SETTINGS, "DECOY_API_KEY: secret\n");
    const preview = previewDshImport(h.userDsh, h.fs);
    expect(preview.found).toBe(true);
    expect(preview.providers.map((p) => p.name)).toEqual(["decoy-provider"]);
    expect(JSON.stringify(preview)).not.toContain("secret");
  });
});

describe("E1: decoy dsh home changes nothing after the wizard exits", () => {
  it("Thursday behaves identically with and without the decoy (no import taken)", async () => {
    const withDecoy = makeHarness();
    seedUserDsh(withDecoy, DECOY_SETTINGS, "DECOY_API_KEY: secret\n");
    const a = await runWizard(baseOpts(withDecoy, { askImport: false }));
    const withoutDecoy = makeHarness();
    const b = await runWizard({
      ...baseOpts(withoutDecoy, { askImport: false }),
      userDshHome: join(withoutDecoy.home, "no-such-dsh"),
    });
    expect(a.frontier).toBe(b.frontier);
    expect(a.flash).toBe(b.flash);
    expect(readSettings(withDecoy)).toBe(readSettings(withoutDecoy));
  });
});

describe("E1: credentials copy carries mode 0600 on a real filesystem", () => {
  it("copyDshImport writes the copy at 0600 and warns about rotation", () => {
    const root = mkdtempSync(join(tmpdir(), "thursday-e1-"));
    try {
      const home = join(root, "home");
      const dsh = join(home, "dsh");
      const userDsh = join(root, "userdsh");
      mkdirSync(join(dsh, "state"), { recursive: true });
      mkdirSync(userDsh, { recursive: true });
      writeFileSync(join(dsh, "settings.yaml"), templateText(), "utf8");
      writeFileSync(join(userDsh, "settings.yaml"), DECOY_SETTINGS, "utf8");
      writeFileSync(join(userDsh, ".credentials.yaml"), "DECOY_API_KEY: secret\n", "utf8");
      const fs = createFilesystemAPI() as unknown as DshFs;
      const result = copyDshImport(userDsh, home, dsh, fs, { now: () => FIXED_NOW });
      expect(result.copied).toBe(true);
      expect(statSync(join(dsh, ".credentials.yaml")).mode & 0o777).toBe(0o600);
      const receipt = readFileSync(join(home, "state", "dsh-import.json"), "utf8");
      expect(receipt).toContain("rotating a key");
      const copied = readFileSync(join(dsh, "settings.yaml"), "utf8");
      expect(copied).toContain("decoy-provider");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("settings-patch: line-wise surgery", () => {
  it("a chains patch preserves the off: key and profile.active", () => {
    const template = templateText();
    const patched = patchRegion(
      template,
      "thursday-chains:begin",
      "thursday-chains:end",
      renderChainsRegion(["p/m1"], ["p/m2"]),
    );
    expect(patched).toContain("          off:");
    expect(patched).toContain("  active: personal");
    expect(patched).toContain("- p/m1");
  });

  it("missing markers throw rather than appending a duplicate region", () => {
    expect(() =>
      patchRegion("no markers\n", "thursday-chains:begin", "thursday-chains:end", []),
    ).toThrow();
  });

  it("a prose mention of the marker in the header does not anchor the region", () => {
    // The real template header names every marker in prose. A substring
    // search anchors on that prose and wipes everything down to the real end
    // marker; exact-trim matching keeps the header and swaps only the body.
    const doc = [
      "#   # thursday-chains:begin / :end      the named route chains",
      "profile:",
      "  chains:",
      "    # thursday-chains:begin",
      "    - old",
      "    # thursday-chains:end",
    ].join("\n");
    const patched = patchRegion(doc, "thursday-chains:begin", "thursday-chains:end", ["    - new"]);
    expect(patched).toContain("#   # thursday-chains:begin / :end");
    // The canaries: everything between the prose mention and the real begin
    // marker is exactly what includes()-anchoring wipes. Without these two
    // lines this test passes under the buggy logic too (proven by a reviewer
    // running the old implementation against this very doc).
    expect(patched).toContain("profile:");
    expect(patched).toContain("  chains:");
    expect(patched).toContain("    - new");
    expect(patched).not.toContain("    - old");
  });
});

describe("E1: template byte-level rules hold after the wizard", () => {
  it("off: and profile.active survive a full run", async () => {
    const h = makeHarness();
    await runWizard(baseOpts(h, {}));
    const text = readSettings(h);
    expect(text).toContain("          off:");
    expect(text).toContain("  active: personal");
    expect(text).toContain("NEVER ROUND-TRIP THIS FILE");
  });
});
