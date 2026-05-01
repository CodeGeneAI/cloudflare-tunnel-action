import * as log from "../util/log";
import { sleep } from "../util/sleep";
import type { CloudflareTunnelsClient } from "./api";
import {
  isCloudflareNotFoundError,
  isCloudflareTunnelActiveConnectionsError,
} from "./errors";

export interface DeleteRetryPolicy {
  readonly maxAttempts: number;
  readonly delayMs: number;
}

export const DEFAULT_DELETE_RETRY_POLICY: DeleteRetryPolicy = {
  maxAttempts: 12,
  delayMs: 5_000,
};

export const deleteTunnelWithRetry = async (
  client: CloudflareTunnelsClient,
  tunnelId: string,
  policy: DeleteRetryPolicy = DEFAULT_DELETE_RETRY_POLICY,
): Promise<void> => {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      await client.delete(tunnelId);
      return;
    } catch (error) {
      if (isCloudflareNotFoundError(error)) {
        log.info(`Tunnel ${tunnelId} already deleted (404).`);
        return;
      }
      if (!isCloudflareTunnelActiveConnectionsError(error)) {
        throw error;
      }
      if (attempt === policy.maxAttempts) {
        throw error;
      }
      log.warning(
        `Tunnel ${tunnelId} has active connections (attempt ${attempt}/${policy.maxAttempts}); cleaning connectors and retrying in ${policy.delayMs}ms.`,
      );
      try {
        await client.cleanupConnections(tunnelId);
      } catch (cleanupError) {
        if (!isCloudflareNotFoundError(cleanupError)) {
          log.warning(
            `cleanupConnections failed: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)
            }`,
          );
        }
      }
      await sleep(policy.delayMs);
    }
  }
};
