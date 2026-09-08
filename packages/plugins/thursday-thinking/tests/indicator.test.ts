/**
 * CRITERION 5 (the gradient runs from the brand-blue token to the brand-orange
 * token, with no literal) and CRITERION 7 (a small animated mark sits to the
 * left, and it honors `prefers-reduced-motion`), as assertions over the
 * generated stylesheet and markup.
 */

import { describe, expect, it } from "vitest";

import { cssVar, tokens } from "@trythursday/tokens";

import {
  GRADIENT_ID,
  INDICATOR_CLASS,
  MARK_CLASS,
  MARK_SVG,
  PHRASE_CLASS,
  buildIndicatorStylesheet,
  renderIndicatorMarkup,
} from "../src/indicator";

const sheet = buildIndicatorStylesheet();

/** Any CSS hex colour: #abc, #abcd, #aabbcc, #aabbccdd. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe("criterion 5: the gradient is the two brand tokens, with no literal", () => {
  it("paints the start stop with the brand-blue token", () => {
    expect(sheet).toContain("." + MARK_CLASS + "-start {\n  stop-color: " + cssVar("brand-blue"));
  });

  it("paints the end stop with the brand-orange token", () => {
    expect(sheet).toContain("." + MARK_CLASS + "-end {\n  stop-color: " + cssVar("brand-orange"));
  });

  it("uses var() references, not the resolved values", () => {
    expect(cssVar("brand-blue")).toBe("var(--th-brand-blue)");
    expect(cssVar("brand-orange")).toBe("var(--th-brand-orange)");
  });

  it("contains no hex literal anywhere in the stylesheet", () => {
    expect(sheet).not.toMatch(HEX);
  });

  it("contains no hex literal in the mark's markup either", () => {
    // The source logo carries #ff8400, #0a5cff, #9a86b4, #ffffff and more. If
    // any of that had been copied along with the geometry, this fails.
    expect(MARK_SVG).not.toMatch(HEX);
  });

  it("does not smuggle a token's value in as a literal", () => {
    // The strongest form of the criterion: not merely "no #rrggbb", but "not
    // the brand colours' actual values, in any notation".
    for (const value of [tokens["brand-blue"], tokens["brand-orange"]]) {
      expect(sheet).not.toContain(value);
      expect(MARK_SVG).not.toContain(value);
      expect(sheet).not.toContain(value.replace("#", ""));
    }
  });

  it("declares the gradient the mark is filled with", () => {
    expect(MARK_SVG).toContain('<linearGradient id="' + GRADIENT_ID + '"');
    expect(MARK_SVG).toContain('fill="url(#' + GRADIENT_ID + ')"');
  });

  it("orders the stops blue first, orange second, so it runs blue to orange", () => {
    const start = MARK_SVG.indexOf(MARK_CLASS + "-start");
    const end = MARK_SVG.indexOf(MARK_CLASS + "-end");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });
});

describe("criterion 7: a small animated mark sits to the left", () => {
  it("puts the mark before the phrase in source order", () => {
    const markup = renderIndicatorMarkup("Choosing my omissions");
    expect(markup.indexOf(MARK_CLASS)).toBeLessThan(markup.indexOf(PHRASE_CLASS));
  });

  it("also orders it left in the flex row, independent of source order", () => {
    expect(sheet).toContain("." + INDICATOR_CLASS + " {\n  display: inline-flex;");
    expect(sheet).toContain("  flex-direction: row;");
    expect(sheet).toMatch(new RegExp("\\." + MARK_CLASS + " \\{[^}]*order: 0;", "s"));
    expect(sheet).toMatch(new RegExp("\\." + PHRASE_CLASS + " \\{[^}]*order: 1;", "s"));
  });

  it("is small: sized in em so it tracks the text it sits beside", () => {
    expect(sheet).toMatch(new RegExp("\\." + MARK_CLASS + " \\{[^}]*width: 1em;", "s"));
    expect(sheet).toMatch(new RegExp("\\." + MARK_CLASS + " \\{[^}]*height: 1em;", "s"));
  });

  it("animates the mark", () => {
    expect(sheet).toContain("animation: th-thinking-breathe");
    expect(sheet).toContain("@keyframes th-thinking-breathe {");
  });

  it("is hidden from assistive technology, since the phrase already says it", () => {
    expect(MARK_SVG).toContain('aria-hidden="true"');
    expect(renderIndicatorMarkup("x")).toContain('role="status"');
    expect(renderIndicatorMarkup("x")).toContain('aria-live="polite"');
  });

  it("keeps the phrase on one line, which is what the 32-character cap buys", () => {
    expect(sheet).toMatch(new RegExp("\\." + PHRASE_CLASS + " \\{[^}]*white-space: nowrap;", "s"));
  });

  it("escapes the phrase rather than trusting it into markup", () => {
    expect(renderIndicatorMarkup('a<b>&"')).toContain("a&lt;b&gt;&amp;&quot;");
  });
});

describe("criterion 7: prefers-reduced-motion is honored", () => {
  const reduced = sheet.slice(sheet.indexOf("@media (prefers-reduced-motion: reduce) {"));

  it("has a reduced-motion block at all", () => {
    expect(sheet).toContain("@media (prefers-reduced-motion: reduce) {");
  });

  it("stops the animation rather than merely slowing it", () => {
    expect(reduced).toContain("animation: none;");
    expect(reduced).not.toMatch(/animation-duration:\s*\d/);
  });

  it("stops the phrase transition too", () => {
    expect(reduced).toContain("transition: none;");
  });

  /**
   * The rule that keeps this honest as the stylesheet grows: collect every
   * selector outside the media block that animates or transitions, and require
   * the media block to name all of them. Adding a fourth moving part and
   * forgetting the media query becomes a test failure.
   */
  it("names every selector that moves", () => {
    const main = sheet.slice(0, sheet.indexOf("@media (prefers-reduced-motion: reduce) {"));
    const moving = new Set<string>();
    const blocks = main.matchAll(/(\.[\w-]+)\s*\{([^}]*)\}/g);
    for (const [, selector, body] of blocks) {
      if (/\b(animation|transition):/.test(body ?? "")) moving.add(selector as string);
    }
    expect(moving.size, "no animated selectors found; the check would be vacuous").toBeGreaterThan(
      0,
    );
    for (const selector of moving) {
      expect(reduced, selector + " moves but is not calmed under reduced motion").toContain(
        selector + " {",
      );
    }
  });

  it("does not animate with SMIL, which reduced-motion cannot switch off", () => {
    // The source logo uses <animateTransform>. Copying it would have shipped
    // motion a user cannot turn off; only the geometry was taken.
    expect(MARK_SVG).not.toContain("animateTransform");
    expect(MARK_SVG).not.toContain("<animate");
  });
});
