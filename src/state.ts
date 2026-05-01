import * as fs from "node:fs";
import * as path from "node:path";

// All process-lifecycle fields are nullable because state is written
// incrementally: in `create` mode we persist the tunnel-id immediately after
// the API call, BEFORE the connector is spawned, so a crash in the install
// or spawn path still leaves the post-step enough information to delete the
// tunnel and avoid an orphan in Cloudflare.
export interface ConnectorState {
  readonly schemaVersion: 1;
  readonly mode: "connect" | "create";
  readonly pid: number | null;
  readonly binaryPath: string | null;
  readonly metricsUrl: string | null;
  readonly logFile: string | null;
  readonly tunnelId: string | null;
  readonly tunnelCname: string | null;
  readonly cleanup: {
    readonly enabled: boolean;
    readonly accountId?: string;
    readonly apiTokenEnvVar?: string;
  };
}

// Per-process state filename. Two `uses:` of this action in the same job each
// run as a distinct child of the runner with a distinct process.pid, so they
// each own their own state file. The post step globs and processes every one.
const STATE_PREFIX = "cf-tunnel-state-";
const STATE_SUFFIX = ".json";

const requireRunnerTemp = (): string => {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp || runnerTemp.length === 0) {
    throw new Error("RUNNER_TEMP is not set; cannot locate state file");
  }
  return runnerTemp;
};

const ownStateFilePath = (): string =>
  path.join(
    requireRunnerTemp(),
    `${STATE_PREFIX}${process.pid}${STATE_SUFFIX}`,
  );

export const writeState = (state: ConnectorState): void => {
  fs.writeFileSync(ownStateFilePath(), JSON.stringify(state), {
    encoding: "utf8",
    mode: 0o600,
  });
};

const readStateFile = (file: string): ConnectorState | null => {
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

// Returns the state written by THIS process (used by main.ts's failure path
// to surface the connector log tail of the in-flight invocation only).
export const readState = (): ConnectorState | null =>
  readStateFile(ownStateFilePath());

// Returns every state file present in $RUNNER_TEMP (used by post.ts so a
// single post invocation cleans up every connector spawned by every `uses:`
// of this action in the job).
export const readAllStates = (): ReadonlyArray<{
  readonly file: string;
  readonly state: ConnectorState;
}> => {
  const runnerTemp = requireRunnerTemp();
  const entries = fs.readdirSync(runnerTemp, { withFileTypes: true });
  const out: { file: string; state: ConnectorState }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(STATE_PREFIX)) continue;
    if (!entry.name.endsWith(STATE_SUFFIX)) continue;
    const file = path.join(runnerTemp, entry.name);
    const state = readStateFile(file);
    if (state) out.push({ file, state });
  }
  return out;
};

export const clearState = (file?: string): void => {
  const target = file ?? ownStateFilePath();
  if (fs.existsSync(target)) fs.unlinkSync(target);
};
