import { describe, it, expect } from 'vitest';

describe('thursday-fonts client', () => {
  it('exports apply, inject, and name', async () => {
    const mod = await import('../src/client.tsx');
    expect(typeof mod.apply).toBe('function');
    expect(Array.isArray(mod.inject)).toBe(true);
    expect(typeof mod.name).toBe('string');
  });

  it('name is thursday-fonts', async () => {
    const mod = await import('../src/client.tsx');
    expect(mod.name).toBe('thursday-fonts');
  });
});

/**
 * TH4's central criterion, as a test rather than a promise.
 *
 * An earlier revision loaded the three families with an `@import` from Google
 * Fonts, which failed four of this ticket's six criteria in one line: a
 * third-party request at runtime, no local-first stack, no bundled copy to fall
 * back to, and nothing rendering with the network disabled. This test fails if
 * anyone reintroduces a remote source.
 *
 * It deliberately inspects the `src` and `@import` surface rather than the whole
 * file, because the file's comments legitimately NAME fonts.googleapis.com while
 * explaining why it is not used, and a naive substring search would forbid the
 * explanation along with the defect.
 */
describe("TH4: fonts are bundled, not fetched", () => {
  const cssSources = () => {
    const srcLines = FONTS_CSS.split("\n").filter((l) => /\bsrc:|@import/.test(l));
    return srcLines.join("\n");
  };

  it("makes no third-party request: no @import and no off-origin url()", () => {
    const sources = cssSources();
    expect(sources).not.toMatch(/@import/);
    expect(sources).not.toMatch(/https?:\/\//);
  });

  it("tries the locally installed font before the bundled copy", () => {
    for (const family of ["Literata", "Inter", "Fantasque Sans Mono"]) {
      const block = FONTS_CSS.slice(FONTS_CSS.indexOf(`font-family: "${family}"`));
      const src = block.slice(block.indexOf("src:"), block.indexOf(";", block.indexOf("src:")));
      expect(src.indexOf("local(")).toBeGreaterThanOrEqual(0);
      expect(src.indexOf("local(")).toBeLessThan(src.indexOf("url("));
    }
  });

  it("ends the monospace stack in the generic, which dsh's own stack does not", () => {
    const mono = FONTS_CSS.split("\n").find((l) => l.includes("--th-font-mono"));
    expect(mono?.trimEnd().endsWith("monospace;")).toBe(true);
  });
});
