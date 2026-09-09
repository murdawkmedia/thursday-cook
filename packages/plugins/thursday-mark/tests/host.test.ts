/**
 * The host half's behaviour: which routes it claims for which files, that the
 * manifest lists only what is served, that the index tap is idempotent, and
 * that an empty export set degrades to dsh's own branding with a warning.
 *
 * File fixtures are real files under a fresh `mkdtemp` directory per test --
 * `resolveBrandFile` exists to refuse escapes, and only the real filesystem
 * can prove it does.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_FILES,
  FAVICON_16_LINK,
  FAVICON_16_PATH,
  FAVICON_ICO_PATH,
  FAVICON_SVG_PATH,
  ICONS_PREFIX,
  MANIFEST_PATH,
  PLUGIN_NAME,
  apply,
  buildManifestBody,
  indexTap,
  manifestIconFor,
  resolveBrandFile,
} from "../src/host";
import type { BrandHostContext } from "../src/host";

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
  vi.restoreAllMocks();
});

/** A brand dir holding exactly the listed B2-relative files, with junk bytes. */
function brandDirWith(files: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "thursday-mark-"));
  scratchDirs.push(dir);
  for (const file of files) {
    const absolute = join(dir, file);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "bytes for " + file);
  }
  return dir;
}

// --- the webServer stub ----------------------------------------------------

interface RegisteredRoute {
  kind: string;
  path: string;
}

function stubServer() {
  const state = {
    routes: [] as RegisteredRoute[],
    taps: [] as Array<(html: string) => string>,
  };
  const webServer = {
    register: (route: { kind: "exact"; path: string; handler: unknown }) => {
      state.routes.push({ kind: route.kind, path: route.path });
      return () => undefined;
    },
    tapIndex: (transform: (html: string) => string) => {
      state.taps.push(transform);
      return () => undefined;
    },
  };
  return { state, webServer };
}

describe("resolveBrandFile", () => {
  it("resolves a present file under the brand dir", () => {
    const dir = brandDirWith(["favicon/favicon.svg"]);
    expect(resolveBrandFile(dir, "favicon/favicon.svg")).toBe(join(dir, "favicon/favicon.svg"));
  });

  it("returns null for a file the export set does not hold", () => {
    const dir = brandDirWith(["favicon/favicon.svg"]);
    expect(resolveBrandFile(dir, "favicon/favicon.ico")).toBeNull();
  });

  it("refuses escapes above the brand dir", () => {
    const dir = brandDirWith(["favicon/favicon.svg"]);
    expect(resolveBrandFile(dir, "../favicon.svg")).toBeNull();
    expect(resolveBrandFile(dir, "favicon/../../etc/passwd")).toBeNull();
  });
});

describe("manifestIconFor", () => {
  it("builds any-purpose entries for the plain icons", () => {
    expect(manifestIconFor(ICONS_PREFIX + "icon-192.png")).toEqual({
      src: ICONS_PREFIX + "icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    });
    expect(manifestIconFor(ICONS_PREFIX + "icon-512.png")).toEqual({
      src: ICONS_PREFIX + "icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    });
  });

  it("marks the maskable icons maskable", () => {
    expect(manifestIconFor(ICONS_PREFIX + "icon-maskable-512.png")).toEqual({
      src: ICONS_PREFIX + "icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });
  });

  it("returns null for favicon routes and strangers", () => {
    expect(manifestIconFor(FAVICON_SVG_PATH)).toBeNull();
    expect(manifestIconFor(FAVICON_ICO_PATH)).toBeNull();
    expect(manifestIconFor(FAVICON_16_PATH)).toBeNull();
    expect(manifestIconFor("/thursday-icons/icon-64.png")).toBeNull();
    expect(manifestIconFor(MANIFEST_PATH)).toBeNull();
  });
});

describe("buildManifestBody", () => {
  it("names Thursday and lists exactly the icons it was given", () => {
    const body = buildManifestBody({
      appName: "Thursday",
      shortName: "Thursday",
      icons: [
        { src: ICONS_PREFIX + "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        {
          src: ICONS_PREFIX + "icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
    const manifest = JSON.parse(body) as {
      name: string;
      short_name: string;
      icons: Array<{ src: string; purpose: string }>;
    };
    expect(manifest.name).toBe("Thursday");
    expect(manifest.short_name).toBe("Thursday");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      ICONS_PREFIX + "icon-192.png",
      ICONS_PREFIX + "icon-maskable-512.png",
    ]);
    expect(manifest.icons[1]?.purpose).toBe("maskable");
  });

  it("honours composition-supplied names", () => {
    const manifest = JSON.parse(
      buildManifestBody({ appName: "Thursday Dev", shortName: "ThuDev", icons: [] }),
    ) as { name: string; short_name: string; icons: unknown[] };
    expect(manifest.name).toBe("Thursday Dev");
    expect(manifest.short_name).toBe("ThuDev");
    expect(manifest.icons).toEqual([]);
  });
});

describe("indexTap", () => {
  const INDEX =
    "<html><head>\n" +
    '    <link rel="manifest" href="/manifest.webmanifest" />\n' +
    '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n' +
    "    <title>DeepSeek Harness</title>\n" +
    "  </head><body></body></html>";

  it("sits the 16px link directly after dsh's svg icon link", () => {
    const tapped = indexTap(INDEX);
    expect(tapped).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n    ' + FAVICON_16_LINK,
    );
    // The title is B3's business; the tap does not touch it.
    expect(tapped).toContain("<title>DeepSeek Harness</title>");
  });

  it("falls back to just inside </head> when no svg link exists", () => {
    const tapped = indexTap("<html><head><title>t</title></head><body></body></html>");
    expect(tapped).toContain(FAVICON_16_LINK + "\n  </head>");
  });

  it("is idempotent: a second run changes nothing", () => {
    expect(indexTap(indexTap(INDEX))).toBe(indexTap(INDEX));
  });

  it("leaves a document with no head alone", () => {
    expect(indexTap("<html><body>bare</body></html>")).toBe("<html><body>bare</body></html>");
  });
});

describe("apply", () => {
  it("registers routes only for the files present, plus the manifest", () => {
    const dir = brandDirWith([
      "favicon/favicon.svg",
      "favicon/favicon-16.png",
      "manifest/icon-192.png",
    ]);
    const { state, webServer } = stubServer();
    const setups: Array<() => () => void> = [];
    const ctx = {
      webServer,
      effect: (setup: () => () => void) => {
        setups.push(setup);
      },
    } as unknown as BrandHostContext;
    apply(ctx, { brandDir: dir });
    expect(setups.length).toBe(1);
    (setups[0] as () => () => void)();
    expect(state.routes.map((route) => route.path).sort()).toEqual(
      [FAVICON_SVG_PATH, FAVICON_16_PATH, ICONS_PREFIX + "icon-192.png", MANIFEST_PATH].sort(),
    );
    for (const route of state.routes) expect(route.kind).toBe("exact");
    // The 16px file is present, so the sized-link tap is registered.
    expect(state.taps.length).toBe(1);
  });

  it("skips the 16px tap when the 16px file is absent", () => {
    const dir = brandDirWith(["favicon/favicon.svg"]);
    const { state, webServer } = stubServer();
    const ctx = {
      webServer,
      effect: (setup: () => () => void) => {
        (setup as () => () => void)();
      },
    } as unknown as BrandHostContext;
    apply(ctx, { brandDir: dir });
    expect(state.routes.map((route) => route.path).sort()).toEqual(
      [FAVICON_SVG_PATH, MANIFEST_PATH].sort(),
    );
    expect(state.taps.length).toBe(0);
  });

  it("warns and registers nothing when the export set was never built", () => {
    const dir = brandDirWith([]);
    const { state, webServer } = stubServer();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = {
      webServer,
      effect: () => {
        throw new Error("effect must not run with no files present");
      },
    } as unknown as BrandHostContext;
    apply(ctx, { brandDir: dir });
    expect(state.routes).toEqual([]);
    expect(state.taps).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(PLUGIN_NAME);
  });

  it("covers every route the table declares", () => {
    // The table is the contract: a route added to BRAND_FILES without a test
    // fixture here is a route asserted nowhere.
    const routes = BRAND_FILES.map((entry) => entry.route).sort();
    expect(routes).toEqual(
      [
        FAVICON_SVG_PATH,
        FAVICON_ICO_PATH,
        FAVICON_16_PATH,
        ICONS_PREFIX + "icon-192.png",
        ICONS_PREFIX + "icon-512.png",
        ICONS_PREFIX + "icon-maskable-192.png",
        ICONS_PREFIX + "icon-maskable-512.png",
      ].sort(),
    );
    const dir = brandDirWith(BRAND_FILES.map((entry) => entry.file));
    const { state, webServer } = stubServer();
    const ctx = {
      webServer,
      effect: (setup: () => () => void) => {
        (setup as () => () => void)();
      },
    } as unknown as BrandHostContext;
    apply(ctx, { brandDir: dir });
    expect(state.routes.map((route) => route.path).sort()).toEqual([...routes, MANIFEST_PATH].sort());
  });

  it("falls back to the dispose event when effect is absent", () => {
    const dir = brandDirWith(["favicon/favicon.svg"]);
    const { state, webServer } = stubServer();
    const listeners = new Map<string, () => void>();
    const ctx = {
      webServer,
      on: (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    } as unknown as BrandHostContext;
    apply(ctx, { brandDir: dir });
    expect(state.routes.length).toBeGreaterThan(0);
    expect(listeners.has("dispose")).toBe(true);
  });
});
