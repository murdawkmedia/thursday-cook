/**
 * Verify that a port really is meridian, and that using it would actually work.
 *
 * E1 branch (b) takes a port from the user. Writing it into the configuration
 * unverified moves the failure to their first session, where it reads as
 * "Thursday is broken" rather than "that was the wrong port". So the wizard
 * asks the service to identify itself, and this module decides what the answer
 * means.
 *
 * WHAT MERIDIAN ACTUALLY ANSWERS. Captured from a running meridian 1.66.0 on
 * 2026-09-07, `GET /health`, 200:
 *
 *   {"status":"healthy","version":"1.66.0",
 *    "build":{"source":"npm","version":"1.66.0","latest":"1.68.0",
 *             "updateAvailable":true},
 *    "auth":{"loggedIn":true,"email":"...","subscriptionType":"max",
 *            "refreshTokenExpiresAt":1790685441670,"daysUntilRenewal":22,
 *            "renewalRequiredSoon":false},
 *    "mode":"internal","claudeExecutable":{"path":"..."}}
 *
 * IDENTIFICATION IS THE COMBINATION, not one field. `{"status":"healthy"}` is
 * the most common health response on the internet and proves nothing: point
 * the wizard at an unrelated service and it would pass. What no other service
 * carries together is `auth` AND `claudeExecutable` — meridian is a Claude
 * subscription proxy, and those two describe exactly that job. Requiring the
 * pair is what makes a false accept implausible rather than merely unlikely.
 *
 * REACHABLE IS NOT THE SAME AS USABLE, and this is why the check goes further
 * than identification. A meridian that is running but logged out answers 200
 * and looks perfect, then fails every request. E1 requires that no path ends
 * with a provider written into the configuration that was never checked, and
 * "something answered" is not a check — `auth.loggedIn` is.
 *
 * IT DOES NOT READ THE EMAIL. The health body contains the account's email
 * address. The wizard has no use for it, so this module never extracts it and
 * never returns it: a value that is not read cannot be logged, written to a
 * configuration file, or sent anywhere by a later change.
 */

/**
 * What a probe of a candidate port means for the wizard.
 *
 * Every `why` is written VERB-FIRST, because it is composed into the sentence
 * "Nothing on port N looks like meridian: it <why>." A noun-phrase reason
 * produced "it the response was not JSON" -- found by running it against a
 * real wrong port rather than by reading it.
 */
export type MeridianVerdict =
  /** Identified, authenticated, and usable now. */
  | {
      readonly kind: "ready";
      readonly version: string | null;
      readonly subscription: string | null;
      readonly daysUntilRenewal: number | null;
      /** meridian's own warning that the subscription needs renewing soon. */
      readonly renewalRequiredSoon: boolean;
    }
  /** It is meridian, but nobody is logged in, so every request would fail. */
  | { readonly kind: "logged-out"; readonly version: string | null }
  /** Something answered, but it is not meridian. */
  | { readonly kind: "not-meridian"; readonly why: string };

/** Read a string field, or null when it is absent or the wrong type. */
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Read a finite number field, or null. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Decide what a `GET /health` response means.
 *
 * Pure: the caller does the network. That keeps every branch testable without
 * a running meridian, which matters because the interesting cases — logged
 * out, an impostor, a truncated body — are the ones hardest to produce on
 * demand.
 *
 * @param status - HTTP status code of the response.
 * @param body - the response body, verbatim.
 */
export function verifyMeridianHealth(status: number, body: string): MeridianVerdict {
  if (status !== 200) {
    return { kind: "not-meridian", why: `answered HTTP ${status}, not 200` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // The SPA fallback of another server is the likeliest thing here: it
    // returns 200 with HTML for any path, so a wrong port often looks alive.
    return { kind: "not-meridian", why: "answered something that is not JSON" };
  }

  if (!isObject(parsed)) {
    return { kind: "not-meridian", why: "answered JSON that is not an object" };
  }

  const auth = parsed.auth;
  const hasAuth = isObject(auth);
  const hasClaude = isObject(parsed.claudeExecutable);
  if (!hasAuth || !hasClaude) {
    const missing = [!hasAuth ? "auth" : null, !hasClaude ? "claudeExecutable" : null]
      .filter((name): name is string => name !== null)
      .join(" and ");
    return {
      kind: "not-meridian",
      why: `answered JSON, but without ${missing}: a health endpoint, not meridian`,
    };
  }

  const version = str(parsed.version);

  if (auth.loggedIn !== true) {
    return { kind: "logged-out", version };
  }

  return {
    kind: "ready",
    version,
    subscription: str(auth.subscriptionType),
    daysUntilRenewal: num(auth.daysUntilRenewal),
    renewalRequiredSoon: auth.renewalRequiredSoon === true,
  };
}

/**
 * One line for the wizard to print, in the second person, saying what happens
 * next rather than only what was found.
 *
 * A refusal that does not say what to do next costs the user the next five
 * minutes, so every unhappy verdict names its remedy.
 */
export function describeMeridianVerdict(verdict: MeridianVerdict, port: number): string {
  switch (verdict.kind) {
    case "ready": {
      const version = verdict.version === null ? "" : ` ${verdict.version}`;
      const plan = verdict.subscription === null ? "" : ` on a ${verdict.subscription} plan`;
      const renewal =
        verdict.renewalRequiredSoon && verdict.daysUntilRenewal !== null
          ? ` Your subscription renews in ${verdict.daysUntilRenewal} days.`
          : "";
      return `meridian${version} is running on port ${port} and signed in${plan}.${renewal}`;
    }
    case "logged-out":
      return (
        `meridian is running on port ${port}, but nobody is signed in, so every ` +
        `request would fail. Sign in with 'meridian login', then run this again.`
      );
    case "not-meridian":
      return (
        `Nothing on port ${port} looks like meridian: it ${verdict.why}. ` +
        `Check the port, or choose the free provider instead.`
      );
  }
}

/** Whether this verdict may be written into the configuration. */
export function isUsable(verdict: MeridianVerdict): boolean {
  return verdict.kind === "ready";
}
