import * as core from "@actions/core";
import { parseInputs } from "./inputs";
import { runConnect } from "./modes/connect";
import { runCreate } from "./modes/create";
import { type ConnectorState, writeState } from "./state";

const API_TOKEN_ENV_VAR = "INPUT_API-TOKEN";

const tunnelCname = (tunnelId: string | null): string | null =>
  tunnelId ? `${tunnelId}.cfargotunnel.com` : null;

const setOutputs = (state: ConnectorState, tunnelToken: string): void => {
  if (state.tunnelId) core.setOutput("tunnel-id", state.tunnelId);
  if (state.tunnelCname) core.setOutput("tunnel-cname", state.tunnelCname);
  if (tunnelToken) core.setOutput("tunnel-token", tunnelToken);
  core.setOutput("metrics-url", state.metricsUrl);
};

const main = async (): Promise<void> => {
  const inputs = parseInputs();

  if (inputs.mode === "connect") {
    const result = await runConnect(inputs);
    const state: ConnectorState = {
      schemaVersion: 1,
      mode: "connect",
      pid: result.pid,
      binaryPath: result.binaryPath,
      metricsUrl: result.metricsUrl,
      logFile: result.logFile,
      tunnelId: result.tunnelId,
      tunnelCname: tunnelCname(result.tunnelId),
      cleanup: { enabled: false },
    };
    writeState(state);
    setOutputs(state, inputs.tunnelToken);
    return;
  }

  const result = await runCreate(inputs);
  const state: ConnectorState = {
    schemaVersion: 1,
    mode: "create",
    pid: result.pid,
    binaryPath: result.binaryPath,
    metricsUrl: result.metricsUrl,
    logFile: result.logFile,
    tunnelId: result.tunnelId,
    tunnelCname: tunnelCname(result.tunnelId),
    cleanup: {
      enabled: inputs.cleanupOnExit,
      accountId: inputs.accountId,
      apiTokenEnvVar: API_TOKEN_ENV_VAR,
    },
  };
  writeState(state);
  setOutputs(state, result.tunnelToken);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
