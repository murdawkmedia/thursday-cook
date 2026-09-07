/**
 * TH1's criteria, as tests rather than as promises.
 *
 * The two that are easiest to fake are first, and both are checked twice: once
 * over the SOURCE (nobody typed a colour) and once over the EMITTED stylesheet
 * (nothing that reaches the browser came from anywhere but the tokens package).
 * A source-only check would pass a file that built a hex string at runtime; an
 * output-only check would pass a file that pasted the palette into a constant
 * and happened to agree with it today.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TOKEN_NAMES, cssPropertyName, renderCss } from "@trythursday/tokens";
import { describe, expect, it } from "vitest";

import { bridgedProperties, bridgedValues } from "../src/bridge";
import {
  CONTAINER_SELECTORS,
  CONTROL_SELECTORS,
  ELEVATED_SELECTORS,
  FOCUS_SELECTORS,
} from "../src/rules";
import { ROOT_SELECTOR, SCOPE_SELECTOR } from "../src/scope";
import { SURFACE_STEP_PROPERTY, buildStylesheet, retargetGeneratedTokens } from "../src/stylesheet";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");

const sourceFiles = readdirSync(srcDir).filter((n) => n.endsWith(".ts") || n.endsWith(".tsx"));
const sources = Object.fromEntries(
  sourceFiles.map((name) => [name, readFileSync(join(srcDir, name), "utf8")]),
);

const sheet = buildStylesheet();

/**
 * The pattern the ticket's own verification step uses.
 *
 * Two copies on purpose: a `g`-flagged regex carries `lastIndex` between calls,
 * so the one used with `.test()` must not be the one used with `.match()`, or
 * the second call in a loop silently starts halfway through the string.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const HEX_ONCE = /#[0-9a-fA-F]{3,8}\b/;

/** Strip CSS comments, so prose about a colour is not read as a declaration. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface Rule {
  readonly selectors: string[];
  readonly body: string;
}

/** Every rule in the emitted sheet. No value in this skin contains a brace. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const match of withoutComments(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    out.push({
      selectors: (match[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
      body: match[2] ?? "",
    });
  }
  return out;
}

/** Every `property: value` pair in the emitted sheet. */
function declarations(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const rule of rules(css)) {
    for (const match of rule.body.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);/g)) {
      out.push([(match[1] ?? "").trim(), (match[2] ?? "").trim()]);
    }
  }
  return out;
}

/** The bodies of every rule whose selector list includes this exact selector. */
function ruleBody(selector: string): string {
  const bodies = rules(sheet)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body);
  expect(bodies.length, `no rule found for ${selector}`).toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("criterion: no colour literal appears in the skin's stylesheets", () => {
  it.each(sourceFiles)("%s contains no hex literal", (name) => {
    const found = (sources[name] ?? "").match(HEX) ?? [];
    expect(found).toEqual([]);
  });

  /**
   * The load-bearing one. Every hex that reaches the browser must be a byte the
   * tokens package emitted; the skin contributes none of its own. Set equality,
   * not a subset: an extra hex means the skin invented a colour, and a MISSING
   * hex would mean the generated block was truncated on the way in.
   */
  it("emits exactly the colours @trythursday/tokens generates, and no others", () => {
    const fromSkin = new Set(sheet.match(HEX) ?? []);
    const fromTokens = new Set(renderCss().match(HEX) ?? []);
    expect([...fromSkin].sort()).toEqual([...fromTokens].sort());
  });

  it("carries the whole token set through, so nothing silently drops out", () => {
    for (const token of TOKEN_NAMES) {
      expect(sheet, `token ${token} is missing from the skin`).toContain(cssPropertyName(token));
    }
  });

  it("expresses every dsh rebinding as a token reference, never as a value", () => {
    const offenders = bridgedValues().filter(
      (value) => !value.includes("var(--th-") || HEX_ONCE.test(value),
    );
    expect(offenders).toEqual([]);
  });

  it("refuses to guess if the generated token block ever changes shape", () => {
    expect(() => retargetGeneratedTokens("body { --th-background: red; }")).toThrow(/:root/);
    expect(() => retargetGeneratedTokens(":root { color: red; }")).toThrow(/--th-/);
  });
});

describe("criterion: focus states are visible on every interactive control", () => {
  // Every selector in the emitted sheet is scoped, so the universal
  // `:focus-visible` is looked up under the skin's scope like everything else.
  const focus = ruleBody(`${SCOPE_SELECTOR} :focus-visible`);

  it("draws the ring from the focus token, the one measured for it", () => {
    expect(focus).toContain("var(--th-focus)");
  });

  /**
   * The ring never touches the control it belongs to. `outline-offset` pushes
   * it clear and the box-shadow fills that gap with the canvas token, so the
   * blue always has `background` on its inner edge (5.74:1) whatever the
   * control is filled with -- focus on `error` measures 1.01:1 and would
   * otherwise be invisible.
   */
  it("puts the canvas token between the ring and the control it rings", () => {
    expect(focus).toContain("outline-offset");
    expect(focus).toMatch(/box-shadow:\s*0 0 0 \S+ var\(--th-background\)/);
  });

  it("uses :focus-visible, so a mouse click paints nothing", () => {
    for (const selector of FOCUS_SELECTORS) {
      expect(selector).toContain(":focus-visible");
    }
  });

  // The ticket names these by hand; so does the test, rather than trusting the
  // universal selector to have covered them.
  it.each([
    ["buttons", "button:focus-visible"],
    ["links", "a:focus-visible"],
    ["inputs", "input:focus-visible"],
    ["textareas", "textarea:focus-visible"],
    ["tabs", '[role="tab"]:focus-visible'],
    ["chips and any custom control", "[tabindex]:focus-visible"],
    ["the composer", '[contenteditable="true"]:focus-visible'],
  ])("covers %s", (_label, selector) => {
    expect(FOCUS_SELECTORS).toContain(selector);
    expect(ruleBody(`${SCOPE_SELECTOR} ${selector}`)).toContain("var(--th-focus)");
  });

  it("overrides the component stylesheets that set outline: none", () => {
    expect(focus).toMatch(/outline:[^;]*!important/);
  });

  it("suppresses the ring in exactly one place, and only for pointer focus", () => {
    const suppressions = [...withoutComments(sheet).matchAll(/outline:\s*none/g)];
    expect(suppressions).toHaveLength(1);
    expect(sheet).toContain(":focus:not(:focus-visible)");
  });
});

describe("criterion: every radius resolves to radius-control or radius-container", () => {
  const allowed = ["var(--th-radius-control)", "var(--th-radius-container)"];

  it("writes no other radius anywhere in the sheet", () => {
    const radii = declarations(sheet).filter(([property]) => property === "border-radius");
    expect(radii.length).toBeGreaterThan(0);
    for (const [, value] of radii) {
      expect(
        allowed.some((token) => value.includes(token)),
        `ad-hoc radius: ${value}`,
      ).toBe(true);
    }
  });

  it.each(["button", "textarea", "select", '[role="tab"]', '[role="button"]'])(
    "%s reads square, at the control radius",
    (selector) => {
      expect(CONTROL_SELECTORS).toContain(selector);
    },
  );

  it.each(["dialog", "pre", '[role="dialog"]', '[role="menu"]'])(
    "%s keeps the container radius",
    (selector) => {
      expect(CONTAINER_SELECTORS).toContain(selector);
    },
  );

  /**
   * The amended criterion, pinned so it cannot be un-amended by accident: the
   * ticket previously forbade any radius over 4px, which the approved token set
   * contradicts. radius-container is 0.75rem and that is correct.
   */
  it("keeps radius-container at the value the amendment approved", () => {
    expect(sheet).toMatch(/--th-radius-container:\s*0\.75rem/);
    expect(sheet).toMatch(/--th-radius-control:\s*3px/);
  });

  it("leaves the user agent's own shapes alone for radio, checkbox and range", () => {
    const input = CONTROL_SELECTORS.find((selector) => selector.startsWith("input"));
    expect(input).toContain(':not([type="radio"])');
    expect(input).toContain(':not([type="checkbox"])');
    expect(input).toContain(':not([type="range"])');
    // ...and they still take Thursday's accent, so the exemption costs nothing.
    expect(ruleBody(SCOPE_SELECTOR)).toContain("accent-color: var(--th-accent)");
  });
});

describe("criterion: panels are distinguished by elevation, not by borders alone", () => {
  it("rebinds all three of dsh's shadow levels", () => {
    for (const level of ["--dsw-shadow-lv1", "--dsw-shadow-lv2", "--dsw-shadow-lv3"]) {
      expect(bridgedProperties()).toContain(level);
    }
  });

  /**
   * The instrument that actually works on near-black: an inset lit rim. An
   * ambient shadow alone is nearly invisible against a near-black canvas, so
   * every level that means "raised" carries a rim as well.
   */
  it("gives each raised level a lit rim as well as an ambient shadow", () => {
    const body = ruleBody(SCOPE_SELECTOR);
    for (const level of ["--dsw-shadow-lv1:", "--dsw-shadow-lv2:", "--dsw-shadow-lv3:"]) {
      const declaration = body.slice(body.indexOf(level), body.indexOf(";", body.indexOf(level)));
      expect(declaration, `${level} has no lit rim`).toContain("inset");
      expect(declaration).toContain("var(--th-");
    }
  });

  it("applies the deepest lift to every floating surface", () => {
    for (const selector of ELEVATED_SELECTORS) {
      expect(ruleBody(`${SCOPE_SELECTOR} ${selector}`)).toContain("var(--dsw-shadow-lv3)");
    }
  });

  /**
   * A regression this skin had and fixed. The focus ring's spacer is a
   * `box-shadow`, which is the same property a floating surface uses for its
   * lift, so focusing a dialog flattened it. Both must survive together.
   */
  it("does not flatten a floating surface when it takes focus", () => {
    for (const selector of ELEVATED_SELECTORS) {
      const body = ruleBody(`${SCOPE_SELECTOR} ${selector}:focus-visible`);
      expect(body, `${selector} loses its lift when focused`).toContain("var(--dsw-shadow-lv3)");
      expect(body).toContain("var(--th-background)");
    }
  });

  it("records the measured surface step in the artifact itself", () => {
    expect(ruleBody(SCOPE_SELECTOR)).toMatch(new RegExp(`${SURFACE_STEP_PROPERTY}:\\s*0\\.\\d+;`));
  });
});

describe("criterion: the user's normal dsh install is visually unchanged", () => {
  /**
   * The strongest form this can take in a stylesheet: NOTHING applies unless
   * the plugin has put its attribute on the body. A single unscoped rule would
   * leak into any page the bundle reached, so every rule head is checked, not a
   * sample.
   */
  it("scopes every rule behind the plugin's own attribute", () => {
    const unscoped = rules(sheet)
      .flatMap((rule) => rule.selectors)
      .filter(
        (selector) => !selector.startsWith(SCOPE_SELECTOR) && !selector.startsWith(ROOT_SELECTOR),
      );
    expect(unscoped).toEqual([]);
  });

  it("outranks dsh's dark-theme layer without resorting to !important for colour", () => {
    // dsh declares its aliases on `body` and `body[data-ds-dark-theme]`, so the
    // skin has to win on `body` itself -- see src/scope.ts.
    expect(SCOPE_SELECTOR).toContain("body[data-thursday-skin]");
    const colourDeclarations = declarations(sheet).filter(
      ([property]) => property.startsWith("--dsw-") || property.startsWith("--shiki-"),
    );
    expect(colourDeclarations.length).toBeGreaterThan(0);
    for (const [property, value] of colourDeclarations) {
      expect(value, `${property} should not need !important`).not.toContain("!important");
    }
  });

  it("confines !important to shape, focus and elevation", () => {
    const important = declarations(sheet)
      .filter(([, value]) => value.includes("!important"))
      .map(([property]) => property);
    expect([...new Set(important)].sort()).toEqual([
      "border-radius",
      "box-shadow",
      "outline",
      "outline-offset",
    ]);
  });
});

describe("the bridge covers the surfaces dsh actually paints with", () => {
  it.each([
    "--dsw-alias-bg-base",
    "--dsw-alias-bg-layer-1",
    "--dsw-alias-bg-layer-2",
    "--dsw-alias-bg-layer-3",
    "--dsw-alias-label-primary",
    "--dsw-alias-label-secondary",
    "--dsw-alias-border-l1",
    "--dsw-alias-border-l3",
    "--dsw-alias-state-error-primary",
    "--dsw-alias-state-success-primary",
    "--dsw-alias-state-warn-primary",
    "--dsw-alias-markdown-code-block",
    "--dsw-alias-scrollbar-bg-l1",
    "--dsw-specific-sidebar-fill",
    "--shiki-token-keyword",
  ])("rebinds %s", (property) => {
    expect(bridgedProperties()).toContain(property);
  });

  it("rebinds each dsh variable exactly once", () => {
    const properties = bridgedProperties();
    const duplicates = properties.filter((p, i) => properties.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });

  /**
   * The ink that lands ON the accent fill. dsh pairs
   * `--dsw-alias-button-primary-fill` with
   * `--dsw-alias-label-primary-foreground`, so mapping the second to the canvas
   * token is what keeps a primary button legible: near-black on orange, 7.75:1.
   */
  it("puts dark ink on the accent fill rather than light ink", () => {
    const body = ruleBody(SCOPE_SELECTOR);
    expect(body).toContain("--dsw-alias-label-primary-foreground: var(--th-background)");
    expect(body).toContain("--dsw-alias-brand-primary: var(--th-accent)");
  });
});
