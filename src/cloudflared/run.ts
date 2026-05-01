import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LogLevel } from "../inputs";
import * as log from "../util/log";

export interface SpawnConnectorParams {
  readonly binaryPath: string;
  readonly token: string;
  readonly loglevel: LogLevel;
  readonly metricsBind: string;
}

export interface SpawnConnectorResult {
  readonly pid: number;
  readonly metricsUrl: string;
  readonly logFile: string;
}

const METRICS_RE = /metrics server on (\d{1,3}(?:\.\d{1,3}){3}:\d+)/i;

const waitForMetricsAddress = async (
  logFile: string,
  timeoutMs: number,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(logFile)) {
      const contents = fs.readFileSync(logFile, "utf8");
      const match = contents.match(METRICS_RE);
      if (match?.[1]) return match[1];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Timed out waiting for cloudflared to report a metrics address in ${logFile}`,
  );
};

export const spawnConnector = async (
  params: SpawnConnectorParams,
): Promise<SpawnConnectorResult> => {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) throw new Error("RUNNER_TEMP is not set");
  const logFile = path.join(runnerTemp, "cloudflared.log");

  const fd = fs.openSync(logFile, "a");
  const args = [
    "tunnel",
    "--no-autoupdate",
    "--loglevel",
    params.loglevel,
    "--metrics",
    params.metricsBind,
    "run",
    "--token",
    params.token,
  ];

  log.info(
    `Spawning cloudflared (loglevel=${params.loglevel}, metrics=${params.metricsBind})`,
  );

  const child = spawn(params.binaryPath, args, {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env },
  });

  if (!child.pid) {
    fs.closeSync(fd);
    throw new Error("Failed to spawn cloudflared (no pid)");
  }

  child.unref();
  fs.closeSync(fd);

  const metricsAddress = await waitForMetricsAddress(logFile, 15_000);
  const metricsUrl = `http://${metricsAddress}`;

  return { pid: child.pid, metricsUrl, logFile };
};

export const tailLog = (logFile: string, lines: number): string => {
  if (!fs.existsSync(logFile)) return "";
  const contents = fs.readFileSync(logFile, "utf8").split("\n");
  return contents.slice(-lines).join("\n");
};
