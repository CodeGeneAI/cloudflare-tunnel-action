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

// Retryable transient failures: 5xx from Cloudflare's edge, 429 rate-limits,
// and any non-API error (most commonly network blips: ECONNRESET, ENOTFOUND,
// fetch-failed, AbortError).
export const isRetryableTransientError = (error: unknown): boolean => {
  if (error instanceof CloudflareApiError) {
    return error.status >= 500 || error.status === 429;
  }
  return error instanceof Error;
};
