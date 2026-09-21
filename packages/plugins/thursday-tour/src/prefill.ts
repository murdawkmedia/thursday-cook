/**
 * The composer prefill attempt (ticket E14).
 *
 * E3 concluded prefill was unavailable, but that was a search for a
 * configuration setting. Plugins live inside the composer -- the attach
 * button was moved between `conversation.input` seats by patching, not by
 * config -- so a client plugin is in the right place to set the input, and
 * this module is the attempt. Whether it works is REPORTED either way: the
 * outcome is shown in the panel and handed to the host, because E3's
 * fallback depends on the answer.
 *
 * Surfaces, in order:
 * 1. the conversation input facade (`setDraft`), when the host exposes it;
 * 2. the composer's own editable element in the DOM.
 * Both are probed structurally and both refuse to clobber: prefill goes
 * only into an EMPTY composer, never over the user's words.
 */

import type { PrefillReport } from "./progress";

/** The smallest slice of the input facade this attempt touches. */
export interface DraftInput {
  setDraft?(text: string): unknown;
  getDraft?(): string;
}

/** The smallest slice of Document this attempt touches. */
export interface PrefillDocument {
  querySelector(selector: string): PrefillElement | null;
}

/** The smallest slice of Element this attempt touches. */
export interface PrefillElement {
  value?: string;
  textContent?: string | null;
  dispatchEvent?(event: unknown): void;
}

/** Event factory, injected so tests never need a DOM Event constructor. */
export interface PrefillEvents {
  inputEvent(): unknown;
}

/** Selectors for the composer's editable, most specific first. */
export const COMPOSER_EDITABLE_SELECTORS: readonly string[] = [
  "[data-composer-seat] textarea",
  "[data-composer-seat] input[type='text']",
  "[data-composer-seat] [contenteditable='true']",
];

export interface PrefillAttempt {
  readonly input?: DraftInput;
  readonly doc?: PrefillDocument;
  readonly events?: PrefillEvents;
  /** The exact text the step offers; absent means the step offers none. */
  readonly text?: string;
}

/**
 * Attempt the prefill and report how it went. Never throws for a missing
 * surface: a missing surface IS the `none` outcome, and the report is what
 * E3's fallback reads.
 */
export function attemptPrefill(attempt: PrefillAttempt): PrefillReport {
  const text = attempt.text ?? "";
  if (text.trim() === "") {
    return { ok: false, method: "none", detail: "this step offers no prefill" };
  }

  const input = attempt.input;
  if (input !== undefined && typeof input.setDraft === "function") {
    try {
      const current = typeof input.getDraft === "function" ? input.getDraft() : "";
      if (current.trim() !== "") {
        return { ok: false, method: "none", detail: "composer is not empty; prefill withheld" };
      }
      input.setDraft(text);
      return {
        ok: true,
        method: "conversation-service",
        detail: "composer draft set through the input facade",
      };
    } catch (error) {
      return {
        ok: false,
        method: "none",
        detail: `input facade refused the draft: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const doc = attempt.doc;
  if (doc !== undefined) {
    for (const selector of COMPOSER_EDITABLE_SELECTORS) {
      let element: PrefillElement | null = null;
      try {
        element = doc.querySelector(selector);
      } catch {
        continue;
      }
      if (element === null) continue;
      const current =
        typeof element.value === "string"
          ? element.value
          : typeof element.textContent === "string"
            ? element.textContent
            : "";
      if (current.trim() !== "") {
        return { ok: false, method: "none", detail: "composer is not empty; prefill withheld" };
      }
      try {
        if (typeof element.value === "string") element.value = text;
        else element.textContent = text;
        if (attempt.events !== undefined) element.dispatchEvent?.(attempt.events.inputEvent());
        return { ok: true, method: "composer-dom", detail: `composer set through ${selector}` };
      } catch (error) {
        return {
          ok: false,
          method: "none",
          detail: `composer element refused the text: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    return { ok: false, method: "none", detail: "no composer editable found in the document" };
  }

  return { ok: false, method: "none", detail: "no input surface available to this panel" };
}
