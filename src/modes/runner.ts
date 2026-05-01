import * as core from "@actions/core";
import type { ActionInputs, ConnectInputs, CreateInputs } from "../inputs";
import { type ConnectorState, writeState } from "../state";
import * as log from "../util/log";
import { installAndSpawn, waitConnectorHealthy } from "./connect";
import { ensureTunnel } from "./create";

// Adding a new mode means: extend the `mode` literal in inputs.ts, write a
// new IModeRunner, and add it to MODE_RUNNERS. The indexed-access type at
// `dispatch` forces every mode literal to be present at compile time, so
// the registry is the single extension axis — no switch statements grow
// when new modes are added.
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
    // 1) Install + spawn. Returns as soon as the connector reports a metrics
    //    address — we have a pid even though the connection is not yet healthy.
    const spawned = await installAndSpawn(inputs);

    // 2) Persist state with the pid IMMEDIATELY so the post-step can SIGTERM
    //    the spawned process even if the healthy-wait below times out.
    const state: ConnectorState = {
      schemaVersion: 1,
      mode: "connect",
      pid: spawned.pid,
      binaryPath: spawned.binaryPath,
      metricsUrl: spawned.metricsUrl,
      logFile: spawned.logFile,
      tunnelId: spawned.tunnelId,
      tunnelCname: tunnelCname(spawned.tunnelId),
      cleanup: { enabled: false },
    };
    writeState(state);
    setOutputs(state);

    // 3) Optionally block until healthy. Throws on timeout, but the post-step
    //    can still tear down because step 2 already wrote the pid.
    await waitConnectorHealthy(inputs, spawned.metricsUrl);

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

    // 3) Install + spawn the connector with the freshly-fetched token.
    const spawned = await installAndSpawn({
      cloudflaredVersion: inputs.cloudflaredVersion,
      loglevel: inputs.loglevel,
      metrics: inputs.metrics,
      waitForConnections: inputs.waitForConnections,
      waitTimeoutSeconds: inputs.waitTimeoutSeconds,
      tunnelToken: ensured.tunnelToken,
    });

    // 4) Persist the full state with the pid BEFORE the healthy-wait so a
    //    healthy-wait timeout does not orphan the connector process.
    const state: ConnectorState = {
      ...rollback,
      pid: spawned.pid,
      binaryPath: spawned.binaryPath,
      metricsUrl: spawned.metricsUrl,
      logFile: spawned.logFile,
    };
    writeState(state);
    setOutputs(state);

    // 5) Optional healthy-wait.
    await waitConnectorHealthy(
      {
        cloudflaredVersion: inputs.cloudflaredVersion,
        loglevel: inputs.loglevel,
        metrics: inputs.metrics,
        waitForConnections: inputs.waitForConnections,
        waitTimeoutSeconds: inputs.waitTimeoutSeconds,
        tunnelToken: ensured.tunnelToken,
      },
      spawned.metricsUrl,
    );

    log.info(
      `Tunnel ready · mode=create · id=${state.tunnelId} · cname=${state.tunnelCname} · pid=${state.pid}`,
    );
    await writeReadySummary(inputs, state);
  },
};

// Type-level guarantee the registry covers every mode: the index type forces
// each mode literal to be present, so adding a new mode is a compile-time
// obligation rather than a runtime if/else edit.
export const MODE_RUNNERS: {
  readonly [M in ActionInputs["mode"]]: IModeRunner<
    Extract<ActionInputs, { mode: M }>
  >;
} = {
  connect: connectRunner,
  create: createRunner,
};

// Indexed-access dispatch. The narrow type assertion is necessary because
// TypeScript cannot prove the runtime mode matches the runner's input type
// after the lookup, but the registry's indexed-access type guarantees it.
export const dispatch = (inputs: ActionInputs): Promise<void> => {
  const runner = MODE_RUNNERS[inputs.mode] as IModeRunner<ActionInputs>;
  return runner.run(inputs);
};
