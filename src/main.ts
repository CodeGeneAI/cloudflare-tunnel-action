import * as core from "@actions/core";
import { tailLog } from "./cloudflared/run";
import { parseInputs } from "./inputs";
import { dispatch } from "./modes/runner";
import { readState } from "./state";
import * as log from "./util/log";

const main = async (): Promise<void> => {
  const inputs = parseInputs();
  await dispatch(inputs);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Surface the cloudflared log tail (if any) so a user debugging a metrics
  // timeout or unhealthy connection sees the connector's own diagnostics
  // alongside our error message. The post step will also tail on cleanup,
  // but it relies on state — and we may have failed before writing state.
  // Tolerate readState throwing (e.g. RUNNER_TEMP unset off-runner).
  try {
    const state = readState();
    if (state?.logFile) {
      const tail = tailLog(state.logFile, 50);
      if (tail.length > 0) {
        core.startGroup("cloudflared (last 50 log lines)");
        log.info(tail);
        core.endGroup();
      }
    }
  } catch {
    /* best-effort: log tail is informational only */
  }
  core.setFailed(message);
});
