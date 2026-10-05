/**
 * Unit tests for the run_code abort-message serialiser (#152, Part A).
 *
 * The canonical serialiser lives in ONE place: `./run-code-abort-helpers.js`,
 * extracted verbatim from dotfiles-ai's sync.sh `PATCH_152_HELPERS` block.
 * These tests evaluate that file, so they pin the SHIPPED patch logic — not
 * a copy of it. Applying it to the installed DSH (the old sync.sh
 * `step_patch_dsh_run_code_abort`, which injected the block into the worker
 * runtime and dsh-tools bundles) is install-engine work not yet ported: until
 * it lands, the helpers are tested but inert.
 *
 * Background (verified against the installed bundle, see the #152
 * report): a rejected inner approval aborts the program with
 * `code run failed (abort): [object Object]`. The destruction happens in
 * dsh-code-runtime-worker-thread, whose abort path does
 * `message: String(request.signal?.reason)` — and the reason is the
 * agent-loop cancel cause `{kind:"user",reason:"approval-rejected"}`, a
 * plain object. `String(object)` is `"[object Object]"`, and by the time
 * dsh-tools builds the CodeRunFailedError text the information is gone:
 * patching the throw site alone cannot recover it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function loadPatchHelpers(): {
  dotfilesAiAbortMessage: (reason: unknown) => string;
  dotfilesAiErrorText: (message: unknown) => string;
} {
  const body = readFileSync(new URL("./run-code-abort-helpers.js", import.meta.url), "utf8");
  const factory = new Function(
    `${body}\nreturn { dotfilesAiAbortMessage, dotfilesAiErrorText };`,
  ) as () => {
    dotfilesAiAbortMessage: (reason: unknown) => string;
    dotfilesAiErrorText: (message: unknown) => string;
  };
  return factory();
}

describe("run_code abort serialisation (#152)", () => {
  it("documents the bug mechanics: String() on the cancel cause is [object Object]", () => {
    // The agent loop cancels with a plain-object cause
    // (dsh-agent-loop agent.cancel({kind, reason})); the worker runtime
    // stringifies it with String(). This is the exact expression that
    // destroyed the rejection before this patch.
    expect(String({ kind: "user", reason: "approval-rejected" })).toBe("[object Object]");
  });

  it("names a rejected approval in words, never [object Object]", () => {
    const { dotfilesAiAbortMessage } = loadPatchHelpers();
    const text = dotfilesAiAbortMessage({ kind: "user", reason: "approval-rejected" });
    expect(text).not.toContain("[object Object]");
    expect(text).toMatch(/reject/i);
    expect(text).toMatch(/do not retry/i);
  });

  it("keeps a rejection comment in the message the model sees", () => {
    const { dotfilesAiAbortMessage } = loadPatchHelpers();
    const text = dotfilesAiAbortMessage({
      kind: "user",
      reason: "approval-rejected",
      comment: "not yet, use rg instead",
    });
    expect(text).toContain("not yet, use rg instead");
    expect(text).not.toContain("[object Object]");
  });

  it("passes strings and Errors through unchanged", () => {
    const { dotfilesAiAbortMessage } = loadPatchHelpers();
    expect(dotfilesAiAbortMessage("run_code settled")).toBe("run_code settled");
    expect(dotfilesAiAbortMessage(new Error("boom"))).toBe("boom");
  });

  it("keeps a non-approval abort distinguishable from a refusal", () => {
    const { dotfilesAiAbortMessage } = loadPatchHelpers();
    // Sandbox fault / dispose / timeout shapes must NOT read as refusals:
    // an agent that confuses them retries a refusal as a transient fault.
    for (const reason of ["runtime disposed", { kind: "disposed" }, { kind: "abort" }]) {
      const text = dotfilesAiAbortMessage(reason);
      expect(text).not.toContain("[object Object]");
      expect(text).not.toMatch(/do not retry/);
    }
    // ...while a refusal always carries the do-not-retry instruction.
    expect(dotfilesAiAbortMessage({ kind: "user", reason: "approval-rejected" })).toMatch(
      /do not retry/,
    );
  });

  it("survives circular and otherwise unserialisable reasons without throwing", () => {
    const { dotfilesAiAbortMessage } = loadPatchHelpers();
    const circular: Record<string, unknown> = { kind: "user" };
    circular.self = circular;
    let text = "";
    expect(() => {
      text = dotfilesAiAbortMessage(circular);
    }).not.toThrow();
    expect(text).not.toContain("[object Object]");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("serialises a structured error message instead of [object Object]", () => {
    const { dotfilesAiErrorText } = loadPatchHelpers();
    expect(dotfilesAiErrorText("plain")).toBe("plain");
    expect(dotfilesAiErrorText(new Error("e"))).toBe("e");
    // The dsh-tools throw-site guard: a non-string message (a future
    // runtime returning a structured message) must still read as data.
    expect(dotfilesAiErrorText({ kind: "abort", detail: "x" })).toBe(
      JSON.stringify({ kind: "abort", detail: "x" }),
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(dotfilesAiErrorText(circular)).not.toContain("[object Object]");
  });
});
