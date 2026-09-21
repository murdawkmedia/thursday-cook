/**
 * The four-rectangle hole: cut from one rect, covering everything but the
 * target, with the card placed beside it (ticket E14).
 */

import { describe, expect, it } from "vitest";

import { isRectVisible, placeCard, rectsForHole } from "../src/spotlight";
import type { Rect, Viewport } from "../src/spotlight";

const VIEWPORT: Viewport = { width: 1280, height: 800 };
const TARGET: Rect = { x: 100, y: 100, width: 200, height: 60 };

describe("rectsForHole", () => {
  it("cuts four panels from one rect: their union plus the target is the viewport", () => {
    const [above, below, left, right] = rectsForHole(VIEWPORT, TARGET);
    const area = (rect: Rect): number => rect.width * rect.height;
    const hole = area(above) + area(below) + area(left) + area(right);
    expect(hole + area(TARGET)).toBe(VIEWPORT.width * VIEWPORT.height);
  });

  it("never covers the target: no panel overlaps it", () => {
    const overlaps = (a: Rect, b: Rect): boolean =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const panel of rectsForHole(VIEWPORT, TARGET)) {
      expect(overlaps(panel, TARGET)).toBe(false);
    }
  });

  it("clamps a target sticking out of the viewport", () => {
    const panels = rectsForHole(VIEWPORT, { x: -50, y: 700, width: 200, height: 200 });
    for (const panel of panels) {
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(VIEWPORT.width);
      expect(panel.y + panel.height).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });
});

describe("isRectVisible", () => {
  it("spots off-screen targets (scroll them into view first)", () => {
    expect(isRectVisible(VIEWPORT, TARGET)).toBe(true);
    expect(isRectVisible(VIEWPORT, { x: 0, y: 900, width: 100, height: 100 })).toBe(false);
    expect(isRectVisible(VIEWPORT, { x: 1300, y: 0, width: 100, height: 100 })).toBe(false);
  });
});

describe("placeCard", () => {
  it("sits right of the target when there is room, without covering it", () => {
    const card = placeCard(VIEWPORT, TARGET, 340, 280);
    expect(card.placement).toBe("right");
    expect(card.x).toBe(TARGET.x + TARGET.width + 16);
    expect(card.x + 340).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("falls to the left, then below, then above", () => {
    const rightBlocked = placeCard(VIEWPORT, { x: 1000, y: 300, width: 200, height: 60 }, 340, 280);
    expect(rightBlocked.placement).toBe("left");
    const sidesBlocked = placeCard(VIEWPORT, { x: 0, y: 0, width: 1280, height: 60 }, 340, 280);
    expect(sidesBlocked.placement).toBe("below");
    const topAndSides = placeCard(VIEWPORT, { x: 0, y: 700, width: 1280, height: 60 }, 340, 280);
    expect(topAndSides.placement).toBe("above");
  });

  it("docks bottom-right with no target: the card-without-spotlight fallback", () => {
    const card = placeCard(VIEWPORT, null, 340, 280);
    expect(card.placement).toBe("corner");
    expect(card.x + 340).toBeLessThanOrEqual(VIEWPORT.width);
    expect(card.y + 280).toBeLessThanOrEqual(VIEWPORT.height);
  });
});
