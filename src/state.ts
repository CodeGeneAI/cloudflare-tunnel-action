import * as fs from "node:fs";
import * as path from "node:path";

export interface ConnectorState {
  readonly schemaVersion: 1;
  readonly mode: "connect" | "create";
  readonly pid: number;
  readonly binaryPath: string;
  readonly metricsUrl: string;
  readonly logFile: string;
  readonly tunnelId: string | null;
  readonly tunnelCname: string | null;
  readonly cleanup: {
    readonly enabled: boolean;
    readonly accountId?: string;
    readonly apiTokenEnvVar?: string;
  };
}

const STATE_FILENAME = "cf-tunnel-state.json";

const stateFilePath = (): string => {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp || runnerTemp.length === 0) {
    throw new Error("RUNNER_TEMP is not set; cannot locate state file");
  }
  return path.join(runnerTemp, STATE_FILENAME);
};

export const writeState = (state: ConnectorState): void => {
  fs.writeFileSync(stateFilePath(), JSON.stringify(state), {
    encoding: "utf8",
    mode: 0o600,
  });
};

export const readState = (): ConnectorState | null => {
  const file = stateFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<ConnectorState>;
    if (parsed.schemaVersion !== 1) return null;
    return parsed as ConnectorState;
  } catch {
    return null;
  }
};

export const clearState = (): void => {
  const file = stateFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
};
