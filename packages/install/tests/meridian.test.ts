import { describe, expect, it } from "vitest";

import { describeMeridianVerdict, isUsable, verifyMeridianHealth } from "../src/meridian.ts";

/**
 * The real shape, captured from meridian 1.66.0 on 2026-09-07 via
 * `GET http://127.0.0.1:9000/health`. The email is redacted -- the module
 * deliberately never reads it, and a fixture is not a place to keep one.
 * Everything else is verbatim, so a change in meridian's response that would
 * break the wizard breaks this test first.
 */
const REAL_HEALTH = JSON.stringify({
  status: "healthy",
  version: "1.66.0",
  build: { source: "npm", version: "1.66.0", latest: "1.68.0", updateAvailable: true },
  auth: {
    loggedIn: true,
    email: "redacted@example.com",
    subscriptionType: "max",
    refreshTokenExpiresAt: 1790685441670,
    daysUntilRenewal: 22,
    renewalRequiredSoon: false,
  },
  mode: "internal",
  claudeExecutable: { path: "/home/user/.local/share/pnpm/store/v11/links/@anthropic-ai/claude" },
});

describe("verifyMeridianHealth", () => {
  it("accepts the real captured response and reads the fields the wizard shows", () => {
    const verdict = verifyMeridianHealth(200, REAL_HEALTH);
    expect(verdict).toEqual({
      kind: "ready",
      version: "1.66.0",
      subscription: "max",
      daysUntilRenewal: 22,
      renewalRequiredSoon: false,
    });
    expect(isUsable(verdict)).toBe(true);
  });

  it("never returns the account email, which the body does carry", () => {
    const verdict = verifyMeridianHealth(200, REAL_HEALTH);
    expect(JSON.stringify(verdict)).not.toContain("@");
  });

  it("refuses a meridian nobody is signed into, which answers 200 and looks fine", () => {
    const loggedOut = REAL_HEALTH.replace('"loggedIn":true', '"loggedIn":false');
    const verdict = verifyMeridianHealth(200, loggedOut);
    expect(verdict).toEqual({ kind: "logged-out", version: "1.66.0" });
    expect(isUsable(verdict)).toBe(false);
  });

  it("treats a missing loggedIn as logged out rather than assuming the best", () => {
    const verdict = verifyMeridianHealth(
      200,
      JSON.stringify({ version: "1.66.0", auth: {}, claudeExecutable: {} }),
    );
    expect(verdict.kind).toBe("logged-out");
  });

  it("rejects a bare healthy response, which proves nothing", () => {
    // The commonest health body on the internet. Accepting it would let the
    // wizard write any unrelated service into the configuration.
    const verdict = verifyMeridianHealth(200, JSON.stringify({ status: "healthy" }));
    expect(verdict.kind).toBe("not-meridian");
    expect(isUsable(verdict)).toBe(false);
  });

  it("names which identifying field was missing", () => {
    const noClaude = verifyMeridianHealth(
      200,
      JSON.stringify({ status: "healthy", auth: { loggedIn: true } }),
    );
    expect(noClaude).toEqual({
      kind: "not-meridian",
      why: "answered JSON, but without claudeExecutable: a health endpoint, not meridian",
    });

    const neither = verifyMeridianHealth(200, JSON.stringify({ status: "healthy" }));
    expect(neither.kind === "not-meridian" && neither.why).toContain("auth and claudeExecutable");
  });

  it("rejects an HTML answer, the shape a wrong port most often gives", () => {
    // A dsh web server returns 200 with the SPA for any unknown path, so a
    // wrong port frequently looks alive.
    const verdict = verifyMeridianHealth(200, "<!doctype html>\n<html><title>Sign in</title>");
    expect(verdict).toEqual({ kind: "not-meridian", why: "answered something that is not JSON" });
  });

  it("rejects a truncated body rather than accepting the part that parsed", () => {
    const verdict = verifyMeridianHealth(200, REAL_HEALTH.slice(0, 60));
    expect(verdict.kind).toBe("not-meridian");
  });

  it("rejects a non-200, naming the status", () => {
    expect(verifyMeridianHealth(502, "")).toEqual({
      kind: "not-meridian",
      why: "answered HTTP 502, not 200",
    });
    expect(verifyMeridianHealth(404, REAL_HEALTH).kind).toBe("not-meridian");
  });

  it("rejects JSON that is not an object", () => {
    expect(verifyMeridianHealth(200, "[]").kind).toBe("not-meridian");
    expect(verifyMeridianHealth(200, "null").kind).toBe("not-meridian");
    expect(verifyMeridianHealth(200, '"healthy"').kind).toBe("not-meridian");
  });

  it("tolerates missing optional fields without downgrading a usable meridian", () => {
    const verdict = verifyMeridianHealth(
      200,
      JSON.stringify({ auth: { loggedIn: true }, claudeExecutable: {} }),
    );
    expect(verdict).toEqual({
      kind: "ready",
      version: null,
      subscription: null,
      daysUntilRenewal: null,
      renewalRequiredSoon: false,
    });
  });
});

describe("describeMeridianVerdict", () => {
  it("states what was found on the happy path", () => {
    const line = describeMeridianVerdict(verifyMeridianHealth(200, REAL_HEALTH), 9000);
    expect(line).toContain("1.66.0");
    expect(line).toContain("port 9000");
    expect(line).toContain("max");
  });

  it("mentions renewal only when meridian itself says it is due soon", () => {
    const quiet = describeMeridianVerdict(verifyMeridianHealth(200, REAL_HEALTH), 9000);
    expect(quiet).not.toContain("renews in");

    const soon = REAL_HEALTH.replace('"renewalRequiredSoon":false', '"renewalRequiredSoon":true');
    const loud = describeMeridianVerdict(verifyMeridianHealth(200, soon), 9000);
    expect(loud).toContain("renews in 22 days");
  });

  it("every reason composes into the sentence that quotes it", () => {
    // The template is "... looks like meridian: it <why>.", so a noun-phrase
    // reason reads as "it the response was not JSON". Checked mechanically.
    const bodies: Array<[number, string]> = [
      [502, ""],
      [200, "<html>"],
      [200, "[]"],
      [200, JSON.stringify({ status: "healthy" })],
    ];
    for (const [status, body] of bodies) {
      const verdict = verifyMeridianHealth(status, body);
      expect(verdict.kind).toBe("not-meridian");
      const line = describeMeridianVerdict(verdict, 1234);
      expect(line).toContain("it answered");
    }
  });

  it("every unhappy verdict names the remedy, not just the problem", () => {
    const loggedOut = REAL_HEALTH.replace('"loggedIn":true', '"loggedIn":false');
    expect(describeMeridianVerdict(verifyMeridianHealth(200, loggedOut), 9000)).toContain(
      "meridian login",
    );

    const wrong = describeMeridianVerdict(verifyMeridianHealth(200, "<html>"), 1234);
    expect(wrong).toContain("Check the port");
    expect(wrong).toContain("free provider");
  });

  it("never prints the email either", () => {
    expect(describeMeridianVerdict(verifyMeridianHealth(200, REAL_HEALTH), 9000)).not.toContain(
      "@",
    );
  });
});
