/**
 * meridian-breaker/detect — the trigger, matched exactly.
 *
 * Fires ONLY when all three hold:
 *   1. status is 500
 *   2. the body parses as JSON with error.type === "api_error"
 *   3. error.message is exactly "session transcript ownership backlog is full"
 *
 * Everything else falls through untouched. A breaker that trips on the wrong
 * error is worse than none.
 *
 * ── Why this module has to reconstruct the body at all ──────────────────
 *
 * There is no dsh seam that carries a raw provider HTTP response body. The
 * recovery waterfall `agent/request-error` carries an `LlmFailure`, and
 * `LlmFailure` is a five-field whitelist — message/code/status/
 * providerRetryAfterMs/requestId (dsh-llm/lib/types/types.d.ts:26). The
 * detaching snapshot at dsh-llm/lib/index.js:507 (`failureSnapshot`) drops
 * every other field, so the body object cannot survive to any listener.
 *
 * What DOES survive is a mechanically-generated, lossless rendering of it.
 * The chain for an Anthropic-protocol provider (meridian is a Claude Max API
 * proxy) is:
 *
 *   @anthropic-ai/sdk/core/error.js:18 `APIError.makeMessage(status, error)`
 *     -> when the parsed body carries no top-level string `message`, returns
 *        `${status} ${JSON.stringify(body)}`   (error.js:23 and :26)
 *   pi-ai/dist/api/anthropic-messages.js:581
 *     -> `output.errorMessage = error.message`  (status + body object dropped)
 *   dsh-llm-pi-ai/lib/index.js:474-481
 *     -> `failure = { message: text, code: classifyPiAiError(text) }`
 *
 * So `failure.message` is the string `"<status> <verbatim JSON body>"`. This
 * module therefore splits an ANCHORED three-digit status prefix and runs a
 * FULL `JSON.parse` on the remainder. That is parsing, not substring matching:
 * the remainder must be complete, well-formed JSON, and the two field checks
 * are strict `===` on parsed values. A body with trailing junk, a truncated
 * body, or a body that merely CONTAINS the phrase all fail to match.
 *
 * `failure.status` is preferred when an adapter supplies it (the pi-ai path
 * does not); the prefix is the fallback source of the status.
 */

/** The one error message this breaker recognizes. Compared with `===`, never `includes`. */
export const BACKLOG_MESSAGE = "session transcript ownership backlog is full";

/** The one provider error type this breaker recognizes. */
export const BACKLOG_ERROR_TYPE = "api_error";

/** The one HTTP status this breaker recognizes. */
export const BACKLOG_STATUS = 500;

/** The subset of `LlmFailure` this module reads. */
export interface FailureLike {
  readonly message?: unknown;
  readonly code?: unknown;
  readonly status?: unknown;
}

/** A status plus the text that should be a complete JSON document. */
interface Candidate {
  readonly status: number;
  readonly bodyText: string;
}

/**
 * Anchored `"<3-digit status> <rest>"`. Anchored at both ends, and the rest is
 * captured whole — this locates the body, it does not search inside it.
 */
const RENDERED = /^(\d{3}) ([\s\S]+)$/;

/**
 * Recover the HTTP status and the candidate body text from a normalized failure.
 * @param failure - the `LlmFailure` carried by `agent/request-error`.
 * @returns the status and body text, or undefined when neither source yields a status.
 */
export function extractCandidate(failure: FailureLike | undefined): Candidate | undefined {
  if (failure === undefined || failure === null) return undefined;
  const message = failure.message;
  if (typeof message !== "string" || message.length === 0) return undefined;

  const rendered = RENDERED.exec(message);
  const structuredStatus = typeof failure.status === "number" && Number.isInteger(failure.status)
    ? failure.status
    : undefined;

  // Prefer an adapter-supplied structured status; fall back to the rendered prefix.
  const status = structuredStatus ?? (rendered ? Number(rendered[1]) : undefined);
  if (status === undefined) return undefined;

  // The body is the text after the status prefix when there is one; otherwise
  // the adapter gave us a structured status and the message may itself be the body.
  const bodyText = rendered ? rendered[2] : message;
  return { status, bodyText };
}

/**
 * The exact triple test.
 * @param failure - the `LlmFailure` carried by `agent/request-error`.
 * @returns true only for status 500 + parsed `error.type === "api_error"` +
 *   `error.message` exactly {@link BACKLOG_MESSAGE}. Any parse failure,
 *   any other status, type, or message returns false.
 */
export function isTranscriptBacklogFailure(failure: FailureLike | undefined): boolean {
  const candidate = extractCandidate(failure);
  if (candidate === undefined) return false;
  if (candidate.status !== BACKLOG_STATUS) return false;

  let body: unknown;
  try {
    body = JSON.parse(candidate.bodyText);
  } catch {
    // A body that fails to parse falls through completely untouched.
    return false;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return false;

  const type = (error as { type?: unknown }).type;
  const message = (error as { message?: unknown }).message;
  return type === BACKLOG_ERROR_TYPE && message === BACKLOG_MESSAGE;
}
