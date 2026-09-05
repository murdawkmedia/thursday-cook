/**
 * Guard rails for the content ticket.
 *
 * These are not tests of the words on the page -- there are no words yet.
 * They pin the three things a later ticket could quietly break while writing
 * copy: that no colour enters the stylesheet as a literal, that the two
 * load-bearing token distinctions (control radius vs container radius, border
 * vs border-strong) stay on the right side of the line, and that the focus
 * ring keeps coming from the one token measured for it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TOKEN_NAMES } from "@trythursday/tokens";
import { describe, expect, it } from "vitest";

import { designPage } from "../src/site/pages/design";
import { indexPage } from "../src/site/pages/index";
import { PAGES } from "../src/site/build";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesDir = join(packageDir, "src", "styles");

const styleFiles = readdirSync(stylesDir).filter((name) => name.endsWith(".css"));
const styles = Object.fromEntries(
  styleFiles.map((name) => [name, readFileSync(join(stylesDir, name), "utf8")]),
);
const allStyles = Object.values(styles).join("\n");

/** Strip comments so prose about colours is not mistaken for a declaration. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every declaration that applies to exactly this selector, concatenated.
 *
 * Exactly: a rule counts when the selector is one whole entry in its
 * comma-separated list, so `pre` picks up both the shared `code, kbd, samp,
 * pre` block and its own, while `.btn--secondary:hover` never answers for
 * `.btn--secondary`.
 */
function ruleBody(selector: string): string {
  const bodies: string[] = [];
  for (const match of withoutComments(allStyles).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? "");
  }
  expect(bodies.length, `no rule found for ${selector}`).toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("colour only ever arrives as a token", () => {
  const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

  it.each(styleFiles)("%s contains no hex literal", (name) => {
    expect(HEX.test(styles[name] ?? "")).toBe(false);
  });

  /** Properties whose value must be a token, a keyword, or a bare length. */
  const COLOUR_PROPERTIES = ["background", "color", "border-color", "border-radius"];
  const ALLOWED = /^(?:transparent|currentColor|inherit|initial|unset|none|0)$/i;

  it("resolves every colour and radius declaration to a --th-* token", () => {
    const offenders: string[] = [];
    for (const [name, css] of Object.entries(styles)) {
      for (const match of withoutComments(css).matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const property = match[1] ?? "";
        const value = (match[2] ?? "").trim();
        if (!COLOUR_PROPERTIES.includes(property)) continue;
        if (value.includes("var(--th-")) continue;
        // A radius may legitimately be a bare 0 corner in a shorthand that
        // also names a token; anything else must reference one.
        if (ALLOWED.test(value)) continue;
        offenders.push(`${name}: ${property}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the two load-bearing token distinctions", () => {
  // Square where the hands are.
  it.each([".btn", ".chip", ".tab", ".field__control", "kbd", ".nav__link"])(
    "%s uses the control radius",
    (selector) => {
      expect(ruleBody(selector)).toContain("var(--th-radius-control)");
    },
  );

  // Rounded where the structure is.
  it.each([".panel", ".well", "pre", ".callout", ".slot"])(
    "%s uses the container radius",
    (selector) => {
      expect(ruleBody(selector)).toContain("var(--th-radius-container)");
    },
  );

  // An outline that is a control's sole identifier must clear 3:1.
  it.each([".btn--secondary", ".chip", ".field__control", "kbd"])(
    "%s is outlined in border-strong, not the hairline",
    (selector) => {
      const body = ruleBody(selector);
      expect(body).toContain("var(--th-border-strong)");
      expect(body).not.toContain("var(--th-border)");
    },
  );

  // ...while chrome that never forms a control's edge stays a hairline.
  it.each([".panel", ".tabs__list", ".banner", ".footer"])(
    "%s divides with the hairline border",
    (selector) => {
      expect(ruleBody(selector)).toContain("var(--th-border)");
    },
  );
});

describe("keyboard", () => {
  it("draws exactly one focus ring, from the focus token", () => {
    const focus = ruleBody(":focus-visible");
    expect(focus).toContain("var(--th-focus)");
    expect(focus).toContain("outline-offset");
    // Nothing else may suppress it except the :focus-visible fallback guard.
    const suppressions = [...withoutComments(allStyles).matchAll(/outline:\s*none/g)];
    expect(suppressions).toHaveLength(1);
  });

  it("puts the skip link first in every page's markup", () => {
    for (const render of [indexPage, designPage]) {
      const markup = render();
      expect(markup.indexOf('class="skip-link"')).toBeGreaterThan(-1);
      expect(markup.indexOf('class="skip-link"')).toBeLessThan(markup.indexOf("<header"));
      expect(markup).toContain('id="main"');
    }
  });

  it("ships the tabs group as a roving-tabindex widget", () => {
    const markup = designPage();
    expect(markup).toContain('role="tablist"');
    expect((markup.match(/tabindex="-1"/g) ?? []).length).toBeGreaterThan(1);
    expect(markup).toContain('aria-selected="true"');
  });
});

describe("the design system page documents the whole token set", () => {
  it("names every token", () => {
    const markup = designPage();
    for (const name of TOKEN_NAMES) {
      expect(markup, `token ${name} is missing from the design page`).toContain(name);
    }
  });

  it("emits directory-style URLs for every page", () => {
    expect(PAGES.map((page) => page.url)).toEqual(["/", "/design/"]);
    for (const page of PAGES) {
      expect(page.file.endsWith("index.html")).toBe(true);
    }
  });
});
