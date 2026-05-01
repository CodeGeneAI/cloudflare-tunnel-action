import * as core from "@actions/core";
import { CloudflareTunnelsClient } from "./cloudflare/api";
import { deleteTunnelWithRetry } from "./cloudflare/delete-with-retry";
import { tailLog } from "./cloudflared/run";
import { type ConnectorState, clearState, readAllStates } from "./state";
import * as log from "./util/log";
import { registerSecret } from "./util/log";
import { sleep } from "./util/sleep";

const SIGTERM_DRAIN_MS = 30_000;
const POLL_INTERVAL_MS = 250;

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const terminate = async (pid: number): Promise<void> => {
  try {
    process.kill(pid, "SIGTERM");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return;
    throw e;
  }

  const deadline = Date.now() + SIGTERM_DRAIN_MS;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(POLL_INTERVAL_MS);
  }

  log.warning(
    `cloudflared (pid ${pid}) did not exit within drain window; SIGKILL`,
  );
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
};

const cleanupTunnel = async (state: ConnectorState): Promise<void> => {
  if (state.mode !== "create" || !state.cleanup.enabled) return;
  if (
    !state.tunnelId ||
    !state.cleanup.accountId ||
    !state.cleanup.apiTokenEnvVar
  ) {
    log.warning(
      "State is missing fields required for tunnel deletion; skipping",
    );
    return;
  }

  const apiToken = process.env[state.cleanup.apiTokenEnvVar];
  if (!apiToken || apiToken.length === 0) {
    log.warning(
      `API token env var "${state.cleanup.apiTokenEnvVar}" is unset; cannot delete tunnel ${state.tunnelId}`,
    );
    return;
  }

  // Defense in depth: re-mask the token in this process so any subsequent
  // error message that happens to include it stays redacted.
  registerSecret(apiToken);

  const client = new CloudflareTunnelsClient({
    accountId: state.cleanup.accountId,
    managementToken: apiToken,
  });

  log.info(`Deleting tunnel ${state.tunnelId}`);
  await deleteTunnelWithRetry(client, state.tunnelId);
};

const cleanupOne = async (
  file: string,
  state: ConnectorState,
): Promise<void> => {
  if (state.pid !== null) {
    try {
      await terminate(state.pid);
    } catch (e) {
      log.warning(
        `Failed to terminate cloudflared (pid ${state.pid}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    log.info(
      "No cloudflared pid recorded (rollback path); skipping connector termination.",
    );
  }

  try {
    await cleanupTunnel(state);
  } catch (e) {
    log.warning(
      `Tunnel cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (state.logFile) {
    const tail = tailLog(state.logFile, 50);
    if (tail.length > 0) {
      core.startGroup(`cloudflared log tail (${state.logFile})`);
      log.info(tail);
      core.endGroup();
    }
  }

  clearState(file);
};

const main = async (): Promise<void> => {
  const states = readAllStates();
  if (states.length === 0) {
    log.info("No cloudflared state files found; nothing to clean up");
    return;
  }
  log.info(`Cleaning up ${states.length} cloudflared invocation(s)`);
  for (const { file, state } of states) {
    await cleanupOne(file, state);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`Post-step error: ${message}`);
});
