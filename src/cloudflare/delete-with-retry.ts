import * as log from "../util/log";
import { sleep } from "../util/sleep";
import {
  isCloudflareNotFoundError,
  isCloudflareTunnelActiveConnectionsError,
  isRetryableTransientError,
} from "./errors";

// Narrow interface — `delete-with-retry` only needs these two methods, not
// the full CloudflareTunnelsClient surface (ISP).
export interface ITunnelDeleter {
  delete(tunnelId: string): Promise<void>;
  cleanupConnections(tunnelId: string): Promise<void>;
}

export interface DeleteRetryPolicy {
  readonly maxAttempts: number;
  readonly delayMs: number;
  // Hard ceiling on total wall-clock time. The post-step has a runner-level
  // grace period (~10s after `cancel`); this cap prevents us from dragging
  // past it and getting hard-killed mid-API-call. Set to slightly less than
  // any plausible `attempts × delay + per-call timeout` budget.
  readonly maxTotalMs: number;
}

export const DEFAULT_DELETE_RETRY_POLICY: DeleteRetryPolicy = {
  maxAttempts: 12,
  delayMs: 5_000,
  maxTotalMs: 4 * 60 * 1000,
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const deleteTunnelWithRetry = async (
  client: ITunnelDeleter,
  tunnelId: string,
  policy: DeleteRetryPolicy = DEFAULT_DELETE_RETRY_POLICY,
): Promise<void> => {
  const start = Date.now();
  const deadline = start + policy.maxTotalMs;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (Date.now() > deadline) {
      log.warning(
        `Tunnel ${tunnelId} cleanup exceeded ${policy.maxTotalMs}ms budget after ${attempt - 1} attempt(s); giving up so the post step can exit cleanly.`,
      );
      return;
    }
    try {
      await client.delete(tunnelId);
      log.info(
        `Tunnel ${tunnelId} deleted after ${attempt} attempt(s) in ${Date.now() - start}ms.`,
      );
      return;
    } catch (error) {
      if (isCloudflareNotFoundError(error)) {
        log.info(`Tunnel ${tunnelId} already deleted (404).`);
        return;
      }

      const isActive = isCloudflareTunnelActiveConnectionsError(error);
      const isTransient = !isActive && isRetryableTransientError(error);
      if (!isActive && !isTransient) throw error;
      if (attempt === policy.maxAttempts) throw error;

      if (isActive) {
        log.warning(
          `Tunnel ${tunnelId} has active connections (attempt ${attempt}/${policy.maxAttempts}); cleaning connectors and retrying in ${policy.delayMs}ms.`,
        );
        try {
          await client.cleanupConnections(tunnelId);
        } catch (cleanupError) {
          if (!isCloudflareNotFoundError(cleanupError)) {
            log.warning(
              `cleanupConnections failed: ${formatError(cleanupError)}`,
            );
          }
        }
      } else {
        log.warning(
          `Transient error deleting tunnel ${tunnelId} (attempt ${attempt}/${policy.maxAttempts}): ${formatError(error)} — retrying in ${policy.delayMs}ms.`,
        );
      }
      await sleep(policy.delayMs);
    }
  }
};
