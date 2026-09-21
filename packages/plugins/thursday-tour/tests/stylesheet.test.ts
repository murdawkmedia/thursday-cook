/**
 * The panel stylesheet: tokens only, two radii, one focus ring.
 *
 * The thursday-ui consistency check in prose: no raw colour anywhere (hex
 * or rgb/hsl function), every radius one of the two tokens, and the exact
 * focus treatment the brief requires -- visible on every button.
 */

import { describe, expect, it } from "vitest";

import { TOUR_TOKENS } from "../src/steps";
import { STYLE_ID, TOUR_CLASS, buildTourStylesheet } from "../src/stylesheet";

describe("buildTourStylesheet", () => {
  it("names no raw colour", () => {
    const css = buildTourStylesheet();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgb\(/);
    expect(css).not.toMatch(/\bhsl\(/);
  });

  it("references only tokens the plugin declares", () => {
    const css = buildTourStylesheet();
    const used = new Set<string>();
    for (const match of css.matchAll(/var\(--th-([a-z-]+)\)/g)) {
      used.add(match[1] as string);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const token of used) {
      expect([...TOUR_TOKENS], `token --th-${token} is declared`).toContain(token);
    }
  });

  it("uses only the two listed radii", () => {
    const css = buildTourStylesheet();
    for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(
        ["var(--th-radius-control)", "var(--th-radius-container)"],
        `radius ${match[1]}`,
      ).toContain((match[1] ?? "").trim());
    }
  });

  it("rings every focused button visibly", () => {
    const css = buildTourStylesheet();
    expect(css).toContain("__btn:focus-visible");
    expect(css).toMatch(/__btn:focus-visible\s*\{[^}]*outline:[^}]*var\(--th-focus\)/);
  });

  it("marks the style element as this plugin's", () => {
    expect(STYLE_ID).toBe("thursday-tour");
    expect(TOUR_CLASS).toBe("th-tour");
  });
});
