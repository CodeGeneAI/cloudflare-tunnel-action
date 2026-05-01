export class CloudflareApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly codes: readonly number[];
  readonly messages: readonly string[];

  constructor(params: {
    status: number;
    method: string;
    path: string;
    codes?: readonly number[];
    messages?: readonly string[];
  }) {
    const messages = params.messages ?? [];
    super(
      messages.join("; ") ||
        `Cloudflare request failed: ${params.method} ${params.path}`,
    );
    this.name = "CloudflareApiError";
    this.status = params.status;
    this.method = params.method;
    this.path = params.path;
    this.codes = params.codes ?? [];
    this.messages = messages;
  }
}

const ACTIVE_CONNECTIONS_PATTERN = /\bactive connections\b/i;

export const isCloudflareTunnelActiveConnectionsError = (
  error: unknown,
): boolean => {
  if (error instanceof CloudflareApiError) {
    return error.messages.some((m) => ACTIVE_CONNECTIONS_PATTERN.test(m));
  }
  return (
    error instanceof Error && ACTIVE_CONNECTIONS_PATTERN.test(error.message)
  );
};

export const isCloudflareNotFoundError = (error: unknown): boolean =>
  error instanceof CloudflareApiError && error.status === 404;

// Allow-list of transient network failures we are willing to retry. Anything
// outside this list (TypeError from a programming bug, JSON parse error, etc.)
// must surface as a hard failure rather than getting swallowed by a 12-attempt
// loop that masks the real defect.
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const RETRYABLE_NETWORK_NAMES = new Set([
  "AbortError",
  "TimeoutError",
  "FetchError",
]);

const errorCode = (error: Error): string | undefined => {
  // node-fetch / undici expose the wire-level error as `cause.code`.
  const errAny = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof errAny.code === "string") return errAny.code;
  if (typeof errAny.cause?.code === "string") return errAny.cause.code;
  return undefined;
};

// Retryable transient failures: 5xx / 429 from Cloudflare's edge, plus a
// curated set of network-y plain-Error shapes (timeouts, aborts, connection
// resets). Programming bugs (TypeError, RangeError, etc.) are intentionally
// NOT retried — the retry loop must not mask defects.
export const isRetryableTransientError = (error: unknown): boolean => {
  if (error instanceof CloudflareApiError) {
    return error.status >= 500 || error.status === 429;
  }
  if (!(error instanceof Error)) return false;
  if (RETRYABLE_NETWORK_NAMES.has(error.name)) return true;
  const code = errorCode(error);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;
  // Last resort: undici / Bun fetch sometimes throws a generic Error with
  // message "fetch failed" (no code on the outer error). Match conservatively.
  return /fetch failed|network error|socket hang up/i.test(error.message);
};
