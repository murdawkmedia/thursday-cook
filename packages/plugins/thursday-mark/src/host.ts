/**
 * Thursday Mark (host half): the favicon and the web app manifest.
 *
 * B2 (`scripts/build-brand-assets.mjs`, ticket 37) cuts the rasters from the
 * one source -- `favicon.svg` (a byte-identical copy of
 * `assets/thursday-logo.svg`), the 16/32/48 PNGs, the packed `favicon.ico`,
 * the 192/512 manifest icons and their maskable variants under `dist/brand`.
 * This ticket wires that set up rather than cutting a second one, and the
 * wiring is a runtime plugin, not a file patch, for the reason
 * `docs/branding.md` establishes: the frontend dist is resolved from workspace
 * knowledge and served through the fallback seat, so only exact routes --
 * which match BEFORE the fallback -- can own `/favicon.svg` and
 * `/manifest.webmanifest`. Nothing in the dsh tree is touched, which is what
 * keeps the user's normal dsh install showing its own branding.
 *
 * WHAT GETS SERVED, exactly:
 *
 *   /favicon.svg          the source mark (animated SVG; favicon renderers
 *                         show its first frame, which is the honest static)
 *   /favicon.ico          B2's packed 16/32/48 legacy icon
 *   /favicon-16.png       the 16px raster -- see the warning below
 *   /thursday-icons/*     the 192/512 "any" and maskable manifest icons
 *   /manifest.webmanifest generated here: name Thursday, icons pointing at
 *                         the routes above that actually exist
 *
 * THE 16PX WARNING, which is the point of the ticket's legibility criterion:
 * an animated SVG gradient does not animate in a favicon in most browsers,
 * and the source's 34-unit kerfs render as 0.88px at 16px -- below the
 * one-pixel separation the rule requires -- while its translucent mid-stop
 * dithers into pastels. The measured verdict (numbers in the ticket report)
 * is that the source as drawn turns to mush at favicon size, so the 16px
 * treatment is the SIMPLIFIED variant `assets/thursday-logo-16.svg` (kerfs
 * filled, no keyline, no shadow, two full-opacity stops fitted horizontally),
 * and B2's 16px raster SHOULD BE REGENERATED FROM IT -- this host half serves
 * whatever `favicon-16.png` the export set holds and adds the sized
 * `<link rel="icon" sizes="16x16">` tap so browsers prefer it at 16px. If the
 * export set predates the regeneration, the served file is still the source
 * render: softer than intended, but the same mark.
 *
 * ABSENT FILES ARE SKIPPED, not faked. Every route is registered only when
 * its file exists under the configured brand directory; the manifest lists
 * only the icons that exist; the 16px link tap is added only when the 16px
 * file exists. A Thursday home whose export set was never built gets a
 * warning and dsh's own branding -- never a 404 where the dolphin was and
 * never an icon invented here.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { normalize, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/** The plugin's name, used in warnings and effect labels. */
export const PLUGIN_NAME = "thursday-mark";

/** Cordis service dependencies. The host half needs the web server: nothing else. */
export const inject: string[] = ["webServer"];

/** Route serving the vector favicon (B2's byte-identical copy of the source). */
export const FAVICON_SVG_PATH = "/favicon.svg";

/** Route serving the packed legacy icon (B2's 16/32/48 `.ico`). */
export const FAVICON_ICO_PATH = "/favicon.ico";

/** Route serving the 16px raster (regenerate from `assets/thursday-logo-16.svg`). */
export const FAVICON_16_PATH = "/favicon-16.png";

/** Route serving the generated web app manifest. */
export const MANIFEST_PATH = "/manifest.webmanifest";

/** Prefix for the manifest icon routes. */
export const ICONS_PREFIX = "/thursday-icons/";

/** Composition-time configuration: where B2's export set lives, and the names. */
export interface BrandHostConfig {
  /** Absolute directory holding B2's export set (`favicon/`, `manifest/`). */
  readonly brandDir: string;
  /** Manifest `name`. Defaults to Thursday. */
  readonly appName?: string;
  /** Manifest `short_name`. Defaults to Thursday. */
  readonly shortName?: string;
}

/** One servable file: its route, its path under the brand dir, its type. */
export interface BrandFile {
  readonly route: string;
  readonly file: string;
  readonly contentType: string;
}

/** Every file this host half can serve. Manifest icons carry their metadata. */
export const BRAND_FILES: readonly BrandFile[] = [
  { route: FAVICON_SVG_PATH, file: "favicon/favicon.svg", contentType: "image/svg+xml" },
  { route: FAVICON_ICO_PATH, file: "favicon/favicon.ico", contentType: "image/x-icon" },
  { route: FAVICON_16_PATH, file: "favicon/favicon-16.png", contentType: "image/png" },
  { route: ICONS_PREFIX + "icon-192.png", file: "manifest/icon-192.png", contentType: "image/png" },
  { route: ICONS_PREFIX + "icon-512.png", file: "manifest/icon-512.png", contentType: "image/png" },
  {
    route: ICONS_PREFIX + "icon-maskable-192.png",
    file: "manifest/icon-maskable-192.png",
    contentType: "image/png",
  },
  {
    route: ICONS_PREFIX + "icon-maskable-512.png",
    file: "manifest/icon-maskable-512.png",
    contentType: "image/png",
  },
];

/** Manifest icon entry derived from a served file. */
export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: string;
}

/** The slice of the `webServer` service this plugin uses, typed structurally. */
export interface WebServerService {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
  tapIndex(transform: (html: string) => string): () => void;
}

export interface BrandHostContext {
  effect?: (setup: () => () => void, label?: string) => unknown;
  on?: (event: string, listener: () => void) => unknown;
  webServer: WebServerService;
}

/**
 * Resolve a brand-dir-relative file to an absolute path, refusing escapes.
 *
 * The table above holds fixed filenames, never request input, so traversal
 * cannot arrive at runtime -- but a misconfigured `brandDir` (a file, a
 * prefix of the real dir) must still fail closed rather than serve surprises.
 * Returns null when the resolved path escapes or the file is absent.
 */
export function resolveBrandFile(brandDir: string, file: string): string | null {
  const root = resolve(normalize(brandDir));
  const target = resolve(normalize(root + sep + file));
  if (target !== root && !target.startsWith(root + sep)) return null;
  if (!existsSync(target)) return null;
  return target;
}

/**
 * The sized-icon link this plugin's tap manages. Exported so the tap's
 * idempotence -- running on EVERY index response -- is asserted, not hoped.
 */
export const FAVICON_16_LINK =
  '<link rel="icon" type="image/png" sizes="16x16" href="' + FAVICON_16_PATH + '" />';

/**
 * Add the 16px favicon link to an index document.
 *
 * Pure, so the placement is a test over a value. Prefers sitting directly
 * after dsh's own svg icon link (the two travel together); falls back to just
 * inside `</head>`; leaves documents with neither alone. Already present --
 * from a previous tap run or the composition's own template -- means
 * unchanged: taps run per response, so doubling the link would be a leak.
 */
export function indexTap(html: string): string {
  if (html.includes(FAVICON_16_LINK)) return html;
  const svgLink = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';
  if (html.includes(svgLink)) {
    return html.replace(svgLink, svgLink + "\n    " + FAVICON_16_LINK);
  }
  const headClose = "</head>";
  if (html.includes(headClose)) {
    return html.replace(headClose, "    " + FAVICON_16_LINK + "\n  " + headClose);
  }
  return html;
}

/**
 * Build the web app manifest body for exactly the icons present.
 *
 * Pure, so the manifest's honesty -- listing only served files, maskable
 * purpose only on maskable files -- is a test over a value rather than a
 * hope about the network. Sizes come from the route filename; purpose is
 * "maskable" when the filename says maskable, "any" otherwise.
 */
export function buildManifestBody(options: {
  appName: string;
  shortName: string;
  icons: readonly ManifestIcon[];
}): string {
  return JSON.stringify(
    {
      id: "/",
      name: options.appName,
      short_name: options.shortName,
      start_url: "/",
      scope: "/",
      display: "fullscreen",
      icons: options.icons.map((icon) => ({
        src: icon.src,
        sizes: icon.sizes,
        type: icon.type,
        purpose: icon.purpose,
      })),
    },
    null,
    2,
  );
}

/**
 * Derive a manifest icon entry from a served route, or null when the route
 * is not a manifest icon (favicon routes are not manifest entries).
 */
export function manifestIconFor(route: string): ManifestIcon | null {
  if (!route.startsWith(ICONS_PREFIX) || !route.endsWith(".png")) return null;
  const filename = route.slice(ICONS_PREFIX.length);
  const size = filename.startsWith("icon-maskable-")
    ? filename.slice("icon-maskable-".length, -".png".length)
    : filename.slice("icon-".length, -".png".length);
  if (size !== "192" && size !== "512") return null;
  return {
    src: route,
    sizes: size + "x" + size,
    type: "image/png",
    purpose: filename.startsWith("icon-maskable-") ? "maskable" : "any",
  };
}

/** Read one request body-free file response. Method-gated like the dist server. */
async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  absolutePath: string,
  contentType: string,
): Promise<void> {
  if (req.method !== undefined && req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const body = await readFile(absolutePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

/**
 * Cordis entry point.
 *
 * Registers an exact route per present file, the manifest route for the
 * manifest body over the present icons, and the 16px link tap when the 16px
 * file is present. Everything is fiber-owned through `ctx.effect` (or the
 * `dispose` fallback), so uninstall removes every route and the tap together.
 */
export function apply(ctx: BrandHostContext, config: BrandHostConfig): void {
  const brandDir = config.brandDir;
  const present: BrandFile[] = [];
  for (const entry of BRAND_FILES) {
    if (resolveBrandFile(brandDir, entry.file) !== null) present.push(entry);
  }

  if (present.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      PLUGIN_NAME + ": no brand files under " + brandDir + "; dsh's own favicon and manifest stand.",
    );
    return;
  }

  const start = (): (() => void) => {
    const stops: Array<() => void> = [];
    for (const entry of present) {
      const absolutePath = resolveBrandFile(brandDir, entry.file) as string;
      const contentType = entry.contentType;
      stops.push(
        ctx.webServer.register({
          kind: "exact",
          path: entry.route,
          handler: (req, res) => void serveFile(req, res, absolutePath, contentType),
        }),
      );
    }

    const icons: ManifestIcon[] = [];
    for (const entry of present) {
      const icon = manifestIconFor(entry.route);
      if (icon !== null) icons.push(icon);
    }
    const body = buildManifestBody({
      appName: config.appName ?? "Thursday",
      shortName: config.shortName ?? "Thursday",
      icons,
    });
    stops.push(
      ctx.webServer.register({
        kind: "exact",
        path: MANIFEST_PATH,
        handler: (req, res) => {
          if (req.method !== undefined && req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          res.writeHead(200, { "content-type": "application/manifest+json" });
          res.end(body);
        },
      }),
    );

    if (present.some((entry) => entry.route === FAVICON_16_PATH)) {
      stops.push(ctx.webServer.tapIndex(indexTap));
    }

    return () => {
      for (let i = stops.length - 1; i >= 0; i--) (stops[i] as () => void)();
    };
  };

  if (typeof ctx?.effect === "function") {
    ctx.effect(start, PLUGIN_NAME + ": favicon and manifest routes");
    return;
  }
  if (typeof ctx?.on === "function") {
    const stop = start();
    ctx.on("dispose", stop);
    return;
  }

  start();
  // eslint-disable-next-line no-console
  console.warn(
    PLUGIN_NAME +
      ": this host provides neither ctx.effect nor ctx.on, so the favicon and " +
      "manifest routes cannot register their own teardown and will survive unload.",
  );
}
