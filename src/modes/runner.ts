import * as core from "@actions/core";
import type { ActionInputs, ConnectInputs, CreateInputs } from "../inputs";
import { type ConnectorState, writeState } from "../state";
import * as log from "../util/log";
import { runConnect } from "./connect";
import { ensureTunnel, runCreate } from "./create";

// Adding a new mode (e.g. `attach-replica`) means: extend the `mode` literal
// in inputs.ts, write a new IModeRunner, and register it in MODE_RUNNERS.
// No call site is modified. The discriminated-union exhaustiveness check
// in main.ts ensures the compiler flags any registration gap.
export interface IModeRunner<I extends ActionInputs> {
  readonly id: I["mode"];
  run(inputs: I): Promise<void>;
}

const API_TOKEN_ENV_VAR = "INPUT_API-TOKEN";

const tunnelCname = (tunnelId: string | null): string | null =>
  tunnelId ? `${tunnelId}.cfargotunnel.com` : null;

const setOutputs = (state: ConnectorState): void => {
  if (state.tunnelId) core.setOutput("tunnel-id", state.tunnelId);
  if (state.tunnelCname) core.setOutput("tunnel-cname", state.tunnelCname);
  if (state.metricsUrl) core.setOutput("metrics-url", state.metricsUrl);
};

const writeReadySummary = async (
  inputs: ActionInputs,
  state: ConnectorState,
): Promise<void> => {
  await core.summary
    .addHeading("Cloudflare Tunnel ready", 2)
    .addTable([
      [
        { data: "Field", header: true },
        { data: "Value", header: true },
      ],
      ["mode", inputs.mode],
      ["tunnel-id", state.tunnelId ?? "(unknown)"],
      ["tunnel-cname", state.tunnelCname ?? "(unknown)"],
      ["metrics-url", state.metricsUrl ?? "(unknown)"],
      ["pid", String(state.pid ?? "(unknown)")],
    ])
    .write();
};

export const connectRunner: IModeRunner<ConnectInputs> = {
  id: "connect",
  async run(inputs) {
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
    setOutputs(state);
    log.info(
      `Tunnel ready · mode=connect · id=${state.tunnelId ?? "?"} · cname=${state.tunnelCname ?? "?"} · pid=${state.pid}`,
    );
    await writeReadySummary(inputs, state);
  },
};

export const createRunner: IModeRunner<CreateInputs> = {
  id: "create",
  async run(inputs) {
    // 1) Ensure the tunnel exists and we have a connector token.
    const ensured = await ensureTunnel(inputs);

    // 2) Persist a rollback state file IMMEDIATELY so the post-step can
    //    delete the tunnel even if the connector spawn or healthy wait
    //    throws. This closes the orphan-tunnel window.
    const rollback: ConnectorState = {
      schemaVersion: 1,
      mode: "create",
      pid: null,
      binaryPath: null,
      metricsUrl: null,
      logFile: null,
      tunnelId: ensured.tunnelId,
      tunnelCname: tunnelCname(ensured.tunnelId),
      cleanup: {
        enabled: inputs.cleanupOnExit,
        accountId: inputs.accountId,
        apiTokenEnvVar: API_TOKEN_ENV_VAR,
      },
    };
    writeState(rollback);

    // 3) Spawn the connector and wait for healthy.
    const result = await runCreate(inputs, ensured);

    // 4) Persist the full state so the post-step can SIGTERM the connector.
    const state: ConnectorState = {
      ...rollback,
      pid: result.pid,
      binaryPath: result.binaryPath,
      metricsUrl: result.metricsUrl,
      logFile: result.logFile,
    };
    writeState(state);
    setOutputs(state);
    log.info(
      `Tunnel ready · mode=create · id=${state.tunnelId} · cname=${state.tunnelCname} · pid=${state.pid}`,
    );
    await writeReadySummary(inputs, state);
  },
};

// Type-level guarantee the registry covers every mode: the index type forces
// each branch of the `mode` literal to be present, so adding a new mode is
// a compile-time obligation rather than a runtime if/else edit.
export const MODE_RUNNERS: {
  connect: IModeRunner<ConnectInputs>;
  create: IModeRunner<CreateInputs>;
} = {
  connect: connectRunner,
  create: createRunner,
};

export const dispatch = (inputs: ActionInputs): Promise<void> => {
  switch (inputs.mode) {
    case "connect":
      return MODE_RUNNERS.connect.run(inputs);
    case "create":
      return MODE_RUNNERS.create.run(inputs);
    default: {
      // Exhaustiveness: TypeScript flags missing cases here at compile time.
      const _exhaustive: never = inputs;
      throw new Error(
        `Unhandled mode in dispatch: ${(_exhaustive as ActionInputs).mode}`,
      );
    }
  }
};
