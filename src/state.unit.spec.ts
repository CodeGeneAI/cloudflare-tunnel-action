import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearState, readState, writeState } from "./state";

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

  test("round-trip", () => {
    writeState({
      schemaVersion: 1,
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
  });

  test("readState returns null when file missing", () => {
    expect(readState()).toBeNull();
  });

  test("readState tolerates malformed JSON", () => {
    const file = path.join(tempDir, "cf-tunnel-state.json");
    fs.writeFileSync(file, "not-json");
    expect(readState()).toBeNull();
  });

  test("clearState removes file and is idempotent", () => {
    writeState({
      schemaVersion: 1,
      mode: "connect",
      pid: 1,
      binaryPath: "/x",
      metricsUrl: "http://x",
      logFile: "/x.log",
      tunnelId: null,
      tunnelCname: null,
      cleanup: { enabled: false },
    });
    clearState();
    expect(readState()).toBeNull();
    clearState();
  });

  test("RUNNER_TEMP missing throws", () => {
    delete process.env.RUNNER_TEMP;
    expect(() => readState()).toThrow(/RUNNER_TEMP/);
  });
});
