import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ConnectorState,
  clearState,
  readAllStates,
  readState,
  writeState,
} from "./state";

const baseState: ConnectorState = {
  schemaVersion: 1,
  mode: "connect",
  pid: null,
  binaryPath: null,
  metricsUrl: null,
  logFile: null,
  tunnelId: null,
  tunnelCname: null,
  cleanup: { enabled: false },
};

describe("state", () => {
  let tempDir: string;
  let originalRunnerTemp: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-state-"));
    originalRunnerTemp = process.env.RUNNER_TEMP;
    process.env.RUNNER_TEMP = tempDir;
  });

  afterEach(() => {
    if (originalRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = originalRunnerTemp;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("round-trip writes per-pid file and reads it back", () => {
    writeState({
      ...baseState,
      mode: "create",
      pid: 1234,
      binaryPath: "/tmp/cloudflared",
      metricsUrl: "http://127.0.0.1:9999",
      logFile: "/tmp/cloudflared.log",
      tunnelId: "abc-123",
      tunnelCname: "abc-123.cfargotunnel.com",
      cleanup: { enabled: true, accountId: "acc", apiTokenEnvVar: "X" },
    });
    const state = readState();
    expect(state).not.toBeNull();
    expect(state?.tunnelId).toBe("abc-123");
    expect(state?.cleanup.enabled).toBe(true);

    const expectedFile = path.join(
      tempDir,
      `cf-tunnel-state-${process.pid}.json`,
    );
    expect(fs.existsSync(expectedFile)).toBe(true);
  });

  test("readState returns null when file missing", () => {
    expect(readState()).toBeNull();
  });

  test("readState tolerates malformed JSON", () => {
    const file = path.join(tempDir, `cf-tunnel-state-${process.pid}.json`);
    fs.writeFileSync(file, "not-json");
    expect(readState()).toBeNull();
  });

  test("clearState removes file and is idempotent", () => {
    writeState(baseState);
    clearState();
    expect(readState()).toBeNull();
    clearState();
  });

  test("readAllStates returns every state file in RUNNER_TEMP", () => {
    fs.writeFileSync(
      path.join(tempDir, "cf-tunnel-state-1.json"),
      JSON.stringify({ ...baseState, tunnelId: "t-1" }),
    );
    fs.writeFileSync(
      path.join(tempDir, "cf-tunnel-state-2.json"),
      JSON.stringify({ ...baseState, tunnelId: "t-2" }),
    );
    fs.writeFileSync(
      path.join(tempDir, "unrelated.json"),
      JSON.stringify({ unrelated: true }),
    );
    fs.writeFileSync(
      path.join(tempDir, "cf-tunnel-state-bad.json"),
      "not-json",
    );

    const all = readAllStates();
    const ids = all
      .map((entry) => entry.state.tunnelId)
      .filter((x): x is string => typeof x === "string")
      .sort();
    expect(ids).toEqual(["t-1", "t-2"]);
  });

  test("RUNNER_TEMP missing throws", () => {
    delete process.env.RUNNER_TEMP;
    expect(() => readState()).toThrow(/RUNNER_TEMP/);
  });
});
