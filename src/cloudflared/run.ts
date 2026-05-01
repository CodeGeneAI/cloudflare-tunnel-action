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

// Tolerates the variants we've seen in cloudflared's stderr across versions:
//   "Starting metrics server on 127.0.0.1:NNN/metrics"
//   "Starting metrics server on [::1]:NNN/metrics"
//   "metrics server on tcp://127.0.0.1:NNN"
// The capture group is whatever address sits between "on" and "/metrics"
// (or end of line).
const METRICS_RE = /metrics server on (?:tcp:\/\/)?(\S+?)(?:\/metrics|\s|$)/i;

export const parseMetricsAddress = (logContents: string): string | null => {
  const match = logContents.match(METRICS_RE);
  return match?.[1] ?? null;
};

// `0.0.0.0` and `[::]` are bind-only addresses that fetch cannot connect to.
// cloudflared can emit either when given `--metrics localhost:0` on a
// dual-stack runner, so normalize them to loopback before composing the URL.
export const normalizeReachableAddress = (address: string): string => {
  if (address.startsWith("[::]:"))
    return `[::1]:${address.slice("[::]:".length)}`;
  if (address.startsWith("0.0.0.0:")) {
    return `127.0.0.1:${address.slice("0.0.0.0:".length)}`;
  }
  return address;
};

const waitForMetricsAddress = async (
  logFile: string,
  timeoutMs: number,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(logFile)) {
      const address = parseMetricsAddress(fs.readFileSync(logFile, "utf8"));
      if (address) return address;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Timed out waiting for cloudflared to report a metrics address. Last 50 lines of ${logFile}:\n${tailLog(logFile, 50)}`,
  );
};

export const spawnConnector = async (
  params: SpawnConnectorParams,
): Promise<SpawnConnectorResult> => {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) throw new Error("RUNNER_TEMP is not set");
  // Per-pid log file so two action invocations in the same job don't clobber each other.
  const logFile = path.join(runnerTemp, `cloudflared-${process.pid}.log`);

  const fd = fs.openSync(logFile, "a");
  // Global flags (--loglevel, --metrics) precede subcommands; that's the
  // canonical cloudflared CLI ordering and the one used by the platform repo.
  const args = [
    "--loglevel",
    params.loglevel,
    "--metrics",
    params.metricsBind,
    "tunnel",
    "--no-autoupdate",
    "run",
    "--token",
    params.token,
  ];

  log.info(
    `Spawning cloudflared (loglevel=${params.loglevel}, metrics=${params.metricsBind}, pid-log=${logFile})`,
  );
  log.debug(
    `spawn argv: ${[params.binaryPath, ...args.filter((a) => a !== params.token)].join(" ")} <token>`,
  );

  const child = spawn(params.binaryPath, args, {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env },
  });

  if (!child.pid) {
    fs.closeSync(fd);
    throw new Error(
      `Failed to spawn cloudflared at ${params.binaryPath} (no pid returned)`,
    );
  }

  child.unref();
  fs.closeSync(fd);

  const rawMetricsAddress = await waitForMetricsAddress(logFile, 15_000);
  const metricsAddress = normalizeReachableAddress(rawMetricsAddress);
  if (metricsAddress !== rawMetricsAddress) {
    log.debug(
      `Normalized cloudflared metrics address ${rawMetricsAddress} → ${metricsAddress}`,
    );
  }
  const metricsUrl = `http://${metricsAddress}`;

  return { pid: child.pid, metricsUrl, logFile };
};

export const tailLog = (logFile: string, lines: number): string => {
  if (!fs.existsSync(logFile)) return "";
  const contents = fs.readFileSync(logFile, "utf8").split("\n");
  return contents.slice(-lines).join("\n");
};
