/**
 * Four-rectangle spotlight geometry (ticket E14).
 *
 * The spotlight is a hole made from four rectangles, and the target is
 * never touched: one `getBoundingClientRect` of the step's element, and the
 * backdrop is drawn as four panels around it -- above, below, left, right.
 * The target region is simply not covered.
 *
 * Why not raise the target above the overlay: `z-index` resolves only
 * within a stacking context, so a target inside an ancestor carrying
 * `transform`, `filter`, `opacity < 1` or `will-change` stays under the
 * backdrop with nothing in the selector to warn you. Four rectangles need
 * no DOM mutation (no residue, nothing for React to clobber mid-step), no
 * stacking-context luck, and no `pointer-events` routing: clicks land
 * because the element is genuinely uncovered.
 *
 * Pure geometry over plain rects: no DOM here, so the hole math is a unit
 * test, not a browser session.
 */

/** A rectangle in viewport pixels, CSS-style. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The viewport the hole is cut from. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Cut the hole: four rectangles covering everything EXCEPT the target.
 * Order is above, below, left, right. Zero-area rects are kept (not
 * dropped) so the renderer always mounts exactly four panels and never
 * branches on geometry.
 */
export function rectsForHole(viewport: Viewport, target: Rect): readonly [Rect, Rect, Rect, Rect] {
  const x = Math.max(0, Math.min(target.x, viewport.width));
  const y = Math.max(0, Math.min(target.y, viewport.height));
  const right = Math.max(x, Math.min(target.x + target.width, viewport.width));
  const bottom = Math.max(y, Math.min(target.y + target.height, viewport.height));
  return [
    { x: 0, y: 0, width: viewport.width, height: y },
    { x: 0, y: bottom, width: viewport.width, height: Math.max(0, viewport.height - bottom) },
    { x: 0, y, width: x, height: Math.max(0, bottom - y) },
    { x: right, y, width: Math.max(0, viewport.width - right), height: Math.max(0, bottom - y) },
  ];
}

/** Whether any part of the target is inside the viewport. */
export function isRectVisible(viewport: Viewport, target: Rect): boolean {
  return (
    target.x < viewport.width &&
    target.y < viewport.height &&
    target.x + target.width > 0 &&
    target.y + target.height > 0
  );
}

/** Where the card went, for tests and diagnostics. */
export type CardPlacement = "right" | "left" | "below" | "above" | "corner";

/** Card position: near the target without covering it. */
export interface CardPosition {
  readonly x: number;
  readonly y: number;
  readonly placement: CardPlacement;
}

const CARD_GAP = 16;

/**
 * Place the card near the target without covering it. Preference order is
 * right, left, below, above -- reading order first, then the sides -- and
 * the card is clamped into the viewport. With no target (a step whose
 * selector matched nothing: the card-without-spotlight fallback), the card
 * docks bottom-right, where it covers the least chrome.
 */
export function placeCard(
  viewport: Viewport,
  target: Rect | null,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  const clamp = (value: number, low: number, high: number): number =>
    Math.max(low, Math.min(value, Math.max(low, high)));
  if (target === null) {
    return {
      x: clamp(viewport.width - cardWidth - 24, 8, viewport.width - cardWidth - 8),
      y: clamp(viewport.height - cardHeight - 24, 8, viewport.height - cardHeight - 8),
      placement: "corner",
    };
  }
  const middleY = clamp(
    target.y + target.height / 2 - cardHeight / 2,
    8,
    viewport.height - cardHeight - 8,
  );
  if (target.x + target.width + CARD_GAP + cardWidth <= viewport.width) {
    return { x: target.x + target.width + CARD_GAP, y: middleY, placement: "right" };
  }
  if (target.x - CARD_GAP - cardWidth >= 0) {
    return { x: target.x - CARD_GAP - cardWidth, y: middleY, placement: "left" };
  }
  if (target.y + target.height + CARD_GAP + cardHeight <= viewport.height) {
    return {
      x: clamp(target.x, 8, viewport.width - cardWidth - 8),
      y: target.y + target.height + CARD_GAP,
      placement: "below",
    };
  }
  if (target.y - CARD_GAP - cardHeight >= 0) {
    return {
      x: clamp(target.x, 8, viewport.width - cardWidth - 8),
      y: target.y - CARD_GAP - cardHeight,
      placement: "above",
    };
  }
  return {
    x: clamp(viewport.width - cardWidth - 24, 8, viewport.width - cardWidth - 8),
    y: clamp(viewport.height - cardHeight - 24, 8, viewport.height - cardHeight - 8),
    placement: "corner",
  };
}
