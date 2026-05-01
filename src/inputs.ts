import * as core from "@actions/core";
import { registerSecret } from "./util/log";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

export interface CommonInputs {
  readonly cloudflaredVersion: string;
  readonly loglevel: LogLevel;
  readonly metrics: string;
  readonly waitForConnections: boolean;
  readonly waitTimeoutSeconds: number;
}

export interface ConnectInputs extends CommonInputs {
  readonly mode: "connect";
  readonly tunnelToken: string;
}

export interface CreateInputs extends CommonInputs {
  readonly mode: "create";
  readonly apiToken: string;
  readonly accountId: string;
  readonly tunnelName: string;
  readonly cleanupOnExit: boolean;
}

export type ActionInputs = ConnectInputs | CreateInputs;

const parseBoolean = (value: string, name: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Input "${name}" must be "true" or "false" (got "${value}")`);
};

const parsePositiveInt = (value: string, name: string): number => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Input "${name}" must be a positive integer (got "${value}")`,
    );
  }
  return n;
};

const parseLogLevel = (value: string): LogLevel => {
  const normalized = value.trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as LogLevel;
  }
  throw new Error(
    `Input "loglevel" must be one of ${LOG_LEVELS.join(", ")} (got "${value}")`,
  );
};

const requireInput = (name: string, value: string, mode: string): string => {
  if (value.trim().length === 0) {
    throw new Error(`Input "${name}" is required when mode=${mode}`);
  }
  return value;
};

export const parseInputs = (): ActionInputs => {
  const mode = (core.getInput("mode") || "connect").trim().toLowerCase();

  const common: CommonInputs = {
    cloudflaredVersion: (
      core.getInput("cloudflared-version") || "latest"
    ).trim(),
    loglevel: parseLogLevel(core.getInput("loglevel") || "info"),
    metrics: (core.getInput("metrics") || "localhost:0").trim(),
    waitForConnections: parseBoolean(
      core.getInput("wait-for-connections") || "true",
      "wait-for-connections",
    ),
    waitTimeoutSeconds: parsePositiveInt(
      core.getInput("wait-timeout-seconds") || "60",
      "wait-timeout-seconds",
    ),
  };

  if (mode === "connect") {
    const tunnelToken = requireInput(
      "tunnel-token",
      core.getInput("tunnel-token"),
      "connect",
    );
    registerSecret(tunnelToken);
    return { mode: "connect", tunnelToken, ...common };
  }

  if (mode === "create") {
    const apiToken = requireInput(
      "api-token",
      core.getInput("api-token"),
      "create",
    );
    registerSecret(apiToken);
    const accountId = requireInput(
      "account-id",
      core.getInput("account-id"),
      "create",
    );
    const tunnelName = requireInput(
      "tunnel-name",
      core.getInput("tunnel-name"),
      "create",
    );
    const cleanupOnExit = parseBoolean(
      core.getInput("cleanup-on-exit") || "true",
      "cleanup-on-exit",
    );
    return {
      mode: "create",
      apiToken,
      accountId,
      tunnelName,
      cleanupOnExit,
      ...common,
    };
  }

  throw new Error(`Input "mode" must be "connect" or "create" (got "${mode}")`);
};
