/**
 * Colour maths used to *verify* the token set, not to generate it.
 *
 * Every token value in `tokens.ts` is a literal that a human chose. These
 * helpers exist so the tests can assert the properties those choices were
 * supposed to have -- contrast, luminance separation, hue separation --
 * instead of those claims sitting unfalsifiable in a comment.
 *
 * sRGB / WCAG 2.x definitions throughout:
 *   https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

/** A colour decomposed into gamma-encoded sRGB channels plus straight alpha. */
export interface Rgba {
  /** Red channel, 0-1, gamma-encoded sRGB. */
  readonly r: number;
  /** Green channel, 0-1, gamma-encoded sRGB. */
  readonly g: number;
  /** Blue channel, 0-1, gamma-encoded sRGB. */
  readonly b: number;
  /** Straight (non-premultiplied) alpha, 0-1. */
  readonly a: number;
}

const HEX_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` into 0-1 sRGB channels.
 * Throws on anything else: a token that is not a hex colour (a radius, a
 * `var()` reference) must never silently measure as black.
 */
export function parseHex(hex: string): Rgba {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`not a hex colour: ${JSON.stringify(hex)}`);
  }
  let body = hex.slice(1);
  if (body.length <= 4) {
    body = [...body].map((char) => char + char).join("");
  }
  const channel = (index: number): number => parseInt(body.slice(index, index + 2), 16) / 255;
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: body.length === 8 ? channel(6) : 1,
  };
}

/** True when the string is a hex colour this module can measure. */
export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value);
}

/** Undo the sRGB transfer function for one channel. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). Alpha is ignored. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two opaque colours, 1 to 21. Order-insensitive. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composite a translucent colour over an opaque one and return the opaque
 * result, so a token like `selection` can be measured as it is actually seen.
 */
export function compositeOver(foreground: string, background: string): string {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  const blend = (f: number, b: number): string =>
    Math.round(255 * (f * fg.a + b * (1 - fg.a)))
      .toString(16)
      .padStart(2, "0");
  return `#${blend(fg.r, bg.r)}${blend(fg.g, bg.g)}${blend(fg.b, bg.b)}`;
}

/** HSL hue in degrees, 0-360. Achromatic colours return 0. */
export function hue(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return 0;
  let degrees: number;
  if (max === r) degrees = 60 * (((g - b) / chroma) % 6);
  else if (max === g) degrees = 60 * ((b - r) / chroma + 2);
  else degrees = 60 * ((r - g) / chroma + 4);
  return (degrees + 360) % 360;
}

/** HSL saturation, 0-1. Used to show that a "muted" token really is muted. */
export function saturation(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * lightness - 1));
}

/** Shortest angular distance between two hues, 0-180 degrees. */
export function hueDistance(a: string, b: string): number {
  const delta = Math.abs(hue(a) - hue(b)) % 360;
  return delta > 180 ? 360 - delta : delta;
}
