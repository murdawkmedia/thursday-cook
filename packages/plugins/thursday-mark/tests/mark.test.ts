/**
 * The mark's criteria as assertions over the generated stylesheet and markup:
 * the gradient runs from the brand-blue token to the brand-orange token with
 * no literal anywhere, the drift is a 14-second loop, and reduced motion
 * yields the static ramp.
 */

import { describe, expect, it } from "vitest";

import { cssVar, tokens } from "@trythursday/tokens";

import {
  GRADIENT_ID,
  MARK_CLASS,
  MARK_SVG,
  buildMarkStylesheet,
} from "../src/mark";

const sheet = buildMarkStylesheet();

/** Any CSS hex colour: #abc, #abcd, #aabbcc, #aabbccdd. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe("the gradient is the two brand tokens, with no literal", () => {
  it("paints the start stop with the brand-blue token", () => {
    expect(sheet).toContain("." + MARK_CLASS + "__start {\n  stop-color: " + cssVar("brand-blue"));
  });

  it("paints the end stop with the brand-orange token", () => {
    expect(sheet).toContain("." + MARK_CLASS + "__end {\n  stop-color: " + cssVar("brand-orange"));
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
    const start = MARK_SVG.indexOf(MARK_CLASS + "__start");
    const end = MARK_SVG.indexOf(MARK_CLASS + "__end");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("carries the source geometry: five segments, same viewBox", () => {
    expect(MARK_SVG).toContain('viewBox="0 0 800 800"');
    const segments = MARK_SVG.match(/<(path|rect)[ >]/g) ?? [];
    expect(segments.length).toBe(5);
  });
});

describe("the drift is a 14-second loop between the endpoints", () => {
  it("animates both stops over 14 seconds", () => {
    expect(sheet).toContain("animation: th-mark-to-orange 14s ease-in-out infinite alternate;");
    expect(sheet).toContain("animation: th-mark-to-blue 14s ease-in-out infinite alternate;");
  });

  it("declares both keyframe blocks", () => {
    expect(sheet).toContain("@keyframes th-mark-to-orange {");
    expect(sheet).toContain("@keyframes th-mark-to-blue {");
  });

  it("starts blue-dominant and returns there, the source's round trip", () => {
    // t=0: blue full, orange faint. `alternate` runs the 14s back, so the
    // loop visits orange-dominant and comes home -- the source's A;B;A.
    expect(sheet).toContain("." + MARK_CLASS + "__start {\n  stop-color: ");
    const startBlock = sheet.slice(
      sheet.indexOf("." + MARK_CLASS + "__start {"),
      sheet.indexOf("." + MARK_CLASS + "__end {"),
    );
    expect(startBlock).toContain("stop-opacity: 1;");
    expect(sheet).toContain("to   { stop-opacity: 0.15; }");
  });
});

describe("prefers-reduced-motion yields the static ramp", () => {
  const reduced = sheet.slice(sheet.indexOf("@media (prefers-reduced-motion: reduce) {"));

  it("has a reduced-motion block at all", () => {
    expect(sheet).toContain("@media (prefers-reduced-motion: reduce) {");
  });

  it("stops the drift rather than merely slowing it", () => {
    expect(reduced).toContain("animation: none;");
    expect(reduced).not.toMatch(/animation-duration:\s*\d/);
  });

  it("rests both stops at full opacity: the full ramp, the honest frame", () => {
    const startReduced = reduced.slice(
      reduced.indexOf("." + MARK_CLASS + "__start {"),
      reduced.indexOf("." + MARK_CLASS + "__end {"),
    );
    const endReduced = reduced.slice(reduced.indexOf("." + MARK_CLASS + "__end {"));
    expect(startReduced).toContain("stop-opacity: 1;");
    expect(endReduced).toContain("stop-opacity: 1;");
  });

  /**
   * The rule that keeps this honest as the stylesheet grows: collect every
   * selector outside the media block that animates or transitions, and require
   * the reduced block to name all of them. Adding a third moving part and
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

  it("is hidden from assistive technology, since the name slot already says it", () => {
    expect(MARK_SVG).toContain('aria-hidden="true"');
  });
});
