import type { FetchLike } from "../cloudflare/api";
import * as log from "../util/log";
import { sleep } from "../util/sleep";

const RELEASES_API =
  "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ResolveVersionOptions {
  readonly fetchImpl?: FetchLike;
  readonly rateLimitRetryDelayMs?: number;
  readonly rateLimitMaxAttempts?: number;
}

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "codegeneai/cloudflare-tunnel-action",
  };
  // Use the runner's GITHUB_TOKEN when present to avoid the unauthenticated
  // 60-req/hour-per-IP rate limit. The token is a GH-issued credential
  // already scoped to the workflow; no extra permissions required.
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  return headers;
};

export const resolveVersion = async (
  requested: string,
  options: ResolveVersionOptions | FetchLike = {},
): Promise<string> => {
  // Backwards-compat: if a function is passed it's the fetchImpl.
  const opts: ResolveVersionOptions =
    typeof options === "function" ? { fetchImpl: options } : options;
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const retryDelayMs = opts.rateLimitRetryDelayMs ?? 30_000;
  const maxAttempts = opts.rateLimitMaxAttempts ?? 2;

  const trimmed = requested.trim();
  if (trimmed.length > 0 && trimmed !== "latest") {
    return trimmed;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(RELEASES_API, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { tag_name?: unknown };
      if (typeof body.tag_name !== "string" || body.tag_name.length === 0) {
        throw new Error(
          "cloudflared latest release missing tag_name in GitHub releases response",
        );
      }
      return body.tag_name;
    }
    const isRateLimit = response.status === 403 || response.status === 429;
    if (isRateLimit && attempt < maxAttempts) {
      log.warning(
        `GitHub releases API returned ${response.status} (likely rate-limited); retrying in ${retryDelayMs}ms (attempt ${attempt}/${maxAttempts}).`,
      );
      await sleep(retryDelayMs);
      continue;
    }
    throw new Error(
      `Failed to resolve cloudflared latest version: ${response.status} ${response.statusText}`,
    );
  }
  // Unreachable: the loop either returns or throws.
  throw new Error("resolveVersion: exhausted retries without a response");
};
