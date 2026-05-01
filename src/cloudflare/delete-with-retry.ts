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
}

export const DEFAULT_DELETE_RETRY_POLICY: DeleteRetryPolicy = {
  maxAttempts: 12,
  delayMs: 5_000,
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const deleteTunnelWithRetry = async (
  client: ITunnelDeleter,
  tunnelId: string,
  policy: DeleteRetryPolicy = DEFAULT_DELETE_RETRY_POLICY,
): Promise<void> => {
  const start = Date.now();
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
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
