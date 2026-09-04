import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  TOKENS,
  TOKEN_NAMES,
  compositeOver,
  contrastRatio,
  cssPropertyName,
  cssValue,
  hue,
  hueDistance,
  isAlias,
  isHexColor,
  relativeLuminance,
  renderCss,
  renderReport,
  saturation,
  tokens,
} from "../src/index";
import type { TokenName } from "../src/index";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(testDir, "..");
const repoRoot = resolve(packageDir, "..", "..");

/**
 * The minimum separation between adjacent surface steps, in absolute WCAG
 * relative luminance. Contrast *ratio* is the wrong instrument down here: near
 * black, the +0.05 flare term dominates and every plausible dark step lands
 * between 1.1:1 and 1.3:1, so the ratio cannot tell a usable step from an
 * invisible one. Absolute luminance can. 0.009 is a hair under the measured
 * background -> background-elevated step and is the floor the set is held to.
 */
const MIN_SURFACE_LUMINANCE_STEP = 0.009;

/** WCAG AAA for body text. The floor for foreground on background. */
const AAA_TEXT = 7;

/** WCAG AA for body text. The floor for every other text-bearing colour. */
const AA_TEXT = 4.5;

/** WCAG AA for non-text boundaries. The floor for the focus ring. */
const AA_NON_TEXT = 3;

const BACKGROUND = tokens.background;
const ELEVATED = tokens["background-elevated"];
const SURFACE = tokens["background-surface"];

describe("acceptance 1: every token has a value and a one-line comment", () => {
  it.each(TOKEN_NAMES)("%s has a non-empty resolved value", (name) => {
    expect(tokens[name]).toBeTruthy();
    expect(tokens[name].trim()).toBe(tokens[name]);
  });

  it.each(TOKEN_NAMES)("%s has a single-line comment naming its use", (name) => {
    const comment = TOKENS[name].comment;
    expect(comment).toBeTruthy();
    expect(comment).not.toContain("\n");
    // A comment that only restates the name is not a use. Require prose.
    expect(comment.split(/\s+/).length).toBeGreaterThanOrEqual(6);
    expect(comment.endsWith(".")).toBe(true);
  });

  it("has exactly the 20 tokens the design calls for", () => {
    expect(TOKEN_NAMES).toHaveLength(20);
    expect(new Set(TOKEN_NAMES).size).toBe(20);
  });
});

describe("acceptance 2: foreground on background clears 7:1", () => {
  it("is at least AAA", () => {
    const ratio = contrastRatio(tokens.foreground, BACKGROUND);
    expect(ratio).toBeGreaterThanOrEqual(AAA_TEXT);
  });

  it("also clears 7:1 on the two higher surfaces", () => {
    expect(contrastRatio(tokens.foreground, ELEVATED)).toBeGreaterThanOrEqual(AAA_TEXT);
    expect(contrastRatio(tokens.foreground, SURFACE)).toBeGreaterThanOrEqual(AAA_TEXT);
  });

  it("keeps muted text readable at AA on every surface", () => {
    for (const surface of [BACKGROUND, ELEVATED, SURFACE]) {
      expect(contrastRatio(tokens["foreground-muted"], surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps every status colour readable at AA on the canvas", () => {
    for (const name of ["success", "warning", "error", "info", "code", "accent"] as TokenName[]) {
      expect(contrastRatio(tokens[name], BACKGROUND)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps the focus ring visible as a boundary on every surface", () => {
    for (const surface of [BACKGROUND, ELEVATED, SURFACE]) {
      expect(contrastRatio(tokens.focus, surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it("leaves selected text readable once selection is composited", () => {
    for (const surface of [BACKGROUND, ELEVATED, SURFACE]) {
      const behind = compositeOver(tokens.selection, surface);
      expect(contrastRatio(tokens.foreground, behind)).toBeGreaterThanOrEqual(AAA_TEXT);
    }
  });
});

describe("acceptance 3: both artifacts come from one source", () => {
  const cssPath = join(packageDir, "dist", "tokens.css");

  it("emits a .css file that matches the renderer exactly", () => {
    expect(readFileSync(cssPath, "utf8")).toBe(renderCss());
  });

  it("emits a measurement report that matches the renderer exactly", () => {
    const reportPath = join(packageDir, "dist", "contrast-report.txt");
    expect(readFileSync(reportPath, "utf8")).toBe(renderReport());
  });

  it("declares every token, and only those tokens, in the stylesheet", () => {
    const css = renderCss();
    const declared = [...css.matchAll(/^\s*(--th-[a-z-]+):/gm)].map((match) => match[1]);
    expect(declared).toEqual(TOKEN_NAMES.map(cssPropertyName));
  });

  it("resolves to identical values through CSS and through the typed object", () => {
    const css = renderCss();
    const raw = new Map<string, string>();
    for (const match of css.matchAll(/^\s*(--th-[a-z-]+):\s*([^;]+);/gm)) {
      raw.set(match[1], match[2].trim());
    }
    const resolveCss = (property: string, depth = 0): string => {
      if (depth > 8) throw new Error(`var() chain too deep at ${property}`);
      const value = raw.get(property);
      if (value === undefined) throw new Error(`undeclared custom property ${property}`);
      const reference = /^var\((--th-[a-z-]+)\)$/.exec(value);
      return reference ? resolveCss(reference[1], depth + 1) : value;
    };
    for (const name of TOKEN_NAMES) {
      expect(resolveCss(cssPropertyName(name))).toBe(tokens[name]);
    }
  });

  it("emits aliases as live var() references, not as copied literals", () => {
    const aliases = TOKEN_NAMES.filter((name) => isAlias(TOKENS[name]));
    expect(aliases.length).toBeGreaterThan(0);
    for (const name of aliases) {
      expect(cssValue(name)).toMatch(/^var\(--th-[a-z-]+\)$/);
      // ...while the typed object still hands back a usable literal.
      expect(isHexColor(tokens[name])).toBe(true);
    }
  });

  it("exports a typed object whose keys are exactly the token names", () => {
    expect(Object.keys(tokens).sort()).toEqual([...TOKEN_NAMES].sort());
    expect(Object.isFrozen(tokens)).toBe(true);
  });
});

describe("acceptance 4: adjacent surface steps clear a stated luminance step", () => {
  it("separates background -> background-elevated", () => {
    const step = relativeLuminance(ELEVATED) - relativeLuminance(BACKGROUND);
    expect(step).toBeGreaterThanOrEqual(MIN_SURFACE_LUMINANCE_STEP);
  });

  it("separates background-elevated -> background-surface", () => {
    const step = relativeLuminance(SURFACE) - relativeLuminance(ELEVATED);
    expect(step).toBeGreaterThanOrEqual(MIN_SURFACE_LUMINANCE_STEP);
  });

  it("orders the three surfaces strictly from dark to light", () => {
    expect(relativeLuminance(BACKGROUND)).toBeLessThan(relativeLuminance(ELEVATED));
    expect(relativeLuminance(ELEVATED)).toBeLessThan(relativeLuminance(SURFACE));
  });

  it("keeps the border visible against the surface it divides", () => {
    expect(relativeLuminance(tokens.border)).toBeGreaterThan(relativeLuminance(SURFACE));
  });
});

describe("acceptance 5: warm hues are mutually distinguishable", () => {
  /** dsh's sandbox-escalation outline, a colour Thursday must not collide with. */
  const DSH_ESCALATION_OUTLINE = "#ff8c00";

  /** Minimum hue separation for two colours that must never be confused. */
  const MIN_HUE_SEPARATION = 14;

  it("separates error, accent, and warning from one another", () => {
    expect(hueDistance(tokens.error, tokens.accent)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
    expect(hueDistance(tokens.accent, tokens.warning)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
    expect(hueDistance(tokens.error, tokens.warning)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
  });

  it("puts warning on the far side of the accent, not between accent and error", () => {
    // The failure mode this guards: a warning picked "between orange and red"
    // lands near 15 degrees, wedged against both neighbours. Gold must sit
    // above the accent's hue, not below it.
    expect(hue(tokens.warning)).toBeGreaterThan(hue(tokens.accent));
    expect(hue(tokens.accent)).toBeGreaterThan(hue(tokens.error));
  });

  it("keeps warning clearly distinct from dsh's escalation orange", () => {
    expect(hueDistance(tokens.warning, DSH_ESCALATION_OUTLINE)).toBeGreaterThanOrEqual(
      MIN_HUE_SEPARATION,
    );
    // Hue alone is not the whole argument: they also separate on lightness.
    expect(contrastRatio(tokens.warning, DSH_ESCALATION_OUTLINE)).toBeGreaterThanOrEqual(1.5);
  });

  it("mutes the muted accent by chroma, keeping it in the accent's hue family", () => {
    expect(saturation(tokens["accent-muted"])).toBeLessThan(saturation(tokens.accent) - 0.3);
    expect(hueDistance(tokens["accent-muted"], tokens.accent)).toBeLessThan(5);
  });

  it("pins the fixed points that were given, not derived", () => {
    expect(tokens["brand-blue"]).toBe("#0a5cff");
    expect(tokens["brand-orange"]).toBe("#ff8400");
    expect(tokens.error).toBe("#f25a5a");
    expect(tokens["radius-container"]).toBe("0.75rem");
    // The gradient's midpoint blend colour is explicitly not a token.
    expect(Object.values(tokens)).not.toContain("#9a86b4");
  });

  it("keeps the control radius square-reading", () => {
    const pixels = Number.parseFloat(tokens["radius-control"]);
    expect(tokens["radius-control"].endsWith("px")).toBe(true);
    expect(pixels).toBeLessThanOrEqual(4);
  });
});

describe("this package is where colour lives", () => {
  const SKIP_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    ".dsh",
    ".pnpm-store",
    "dist",
    "lib",
    "build",
  ]);
  const SCANNED_EXTENSIONS = [".ts", ".tsx", ".css", ".js", ".jsx", ".mjs", ".cjs"];
  const HEX_LITERAL = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry)) continue;
        if (full === packageDir) continue; // colour is allowed to live here
        yield* walk(full);
      } else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
        yield full;
      }
    }
  }

  it("finds no hard-coded hex colour in code outside packages/tokens", () => {
    const offenders: string[] = [];
    for (const file of walk(repoRoot)) {
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, index) => {
        if (HEX_LITERAL.test(line)) {
          offenders.push(`${relative(repoRoot, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
