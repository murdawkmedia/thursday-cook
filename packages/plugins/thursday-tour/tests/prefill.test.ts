/**
 * The prefill attempt, reported either way (ticket E14).
 *
 * E3's fallback depends on the answer, so every outcome -- set, withheld,
 * or no surface at all -- is a `PrefillReport` with a named method, never
 * a throw and never silence. The panel shows the report; the host records
 * it; this suite pins the mapping from surface to report.
 */

import { describe, expect, it } from "vitest";

import { COMPOSER_EDITABLE_SELECTORS, attemptPrefill } from "../src/prefill";

describe("attemptPrefill", () => {
  it("sets the draft through the input facade", () => {
    const drafts: string[] = [];
    const report = attemptPrefill({
      text: "Add login to my blog",
      input: { getDraft: () => "", setDraft: (text) => void drafts.push(text) },
    });
    expect(report).toEqual({
      ok: true,
      method: "conversation-service",
      detail: expect.stringContaining("input facade") as unknown as string,
    });
    expect(drafts).toEqual(["Add login to my blog"]);
  });

  it("withholds the prefill when the composer is not empty", () => {
    const drafts: string[] = [];
    const report = attemptPrefill({
      text: "Add login to my blog",
      input: { getDraft: () => "the user's own words", setDraft: (text) => void drafts.push(text) },
    });
    expect(report.ok).toBe(false);
    expect(report.detail).toMatch(/not empty/);
    expect(drafts).toEqual([]);
  });

  it("sets the composer's editable in the DOM and announces the input", () => {
    const seen: unknown[] = [];
    const element = { value: "", dispatchEvent: (event: unknown) => void seen.push(event) };
    const report = attemptPrefill({
      text: "Add login to my blog",
      doc: {
        querySelector: (selector: string) => (selector.includes("textarea") ? element : null),
      },
      events: { inputEvent: () => ({ type: "input" }) },
    });
    expect(report.ok).toBe(true);
    expect(report.method).toBe("composer-dom");
    expect(element.value).toBe("Add login to my blog");
    expect(seen.length).toBe(1);
  });

  it("reports no-surface when the composer is absent, and never throws", () => {
    expect(attemptPrefill({ text: "hi", doc: { querySelector: () => null } })).toEqual({
      ok: false,
      method: "none",
      detail: "no composer editable found in the document",
    });
    expect(attemptPrefill({ text: "hi" })).toEqual({
      ok: false,
      method: "none",
      detail: "no input surface available to this panel",
    });
    expect(attemptPrefill({})).toEqual({
      ok: false,
      method: "none",
      detail: "this step offers no prefill",
    });
  });

  it("reports a refusing surface instead of throwing", () => {
    const report = attemptPrefill({
      text: "hi",
      input: {
        setDraft: () => {
          throw new Error("locked");
        },
      },
    });
    expect(report.ok).toBe(false);
    expect(report.detail).toMatch(/locked/);
  });

  it("probes the composer's editables, most specific first", () => {
    expect(COMPOSER_EDITABLE_SELECTORS[0]).toContain("textarea");
    expect(
      COMPOSER_EDITABLE_SELECTORS.every((selector) => selector.startsWith("[data-composer-seat]")),
    ).toBe(true);
  });
});
