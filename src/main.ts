import * as core from "@actions/core";
import { tailLog } from "./cloudflared/run";
import { parseInputs } from "./inputs";
import { dispatch } from "./modes/runner";
import { readState } from "./state";
import * as log from "./util/log";

const writeFailureSummary = async (
  message: string,
  logFile: string | null,
  tunnelId: string | null,
): Promise<void> => {
  try {
    await core.summary
      .addHeading("Cloudflare Tunnel failed", 2)
      .addRaw(`\n\n**Error:** ${message}\n\n`)
      .addTable([
        [
          { data: "Field", header: true },
          { data: "Value", header: true },
        ],
        ["tunnel-id", tunnelId ?? "(unknown)"],
        ["log-file", logFile ?? "(none recorded)"],
      ])
      .write();
  } catch {
    /* summary write is best-effort; never re-throw from the failure path */
  }
};

const main = async (): Promise<void> => {
  const inputs = parseInputs();
  await dispatch(inputs);
};

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Surface the cloudflared log tail (if any) so a user debugging a metrics
  // timeout or unhealthy connection sees the connector's own diagnostics
  // alongside our error message. Tolerate readState throwing (e.g.
  // RUNNER_TEMP unset off-runner) so smoke tests don't crash.
  let state = null;
  try {
    state = readState();
  } catch {
    /* best-effort: no state available */
  }
  if (state?.logFile) {
    const tail = tailLog(state.logFile, 50);
    if (tail.length > 0) {
      core.startGroup("cloudflared (last 50 log lines)");
      log.info(tail);
      core.endGroup();
    }
  }
  await writeFailureSummary(
    message,
    state?.logFile ?? null,
    state?.tunnelId ?? null,
  );
  core.setFailed(message);
});
