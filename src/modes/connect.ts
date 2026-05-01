import { waitForHealthy } from "../cloudflared/health";
import { installCloudflared } from "../cloudflared/install";
import { detectPlatform } from "../cloudflared/platform";
import { spawnConnector } from "../cloudflared/run";
import { resolveVersion } from "../cloudflared/version";
import type { CommonInputs } from "../inputs";
import * as log from "../util/log";

export interface ConnectModeParams extends CommonInputs {
  readonly tunnelToken: string;
}

export interface ConnectModeResult {
  readonly pid: number;
  readonly metricsUrl: string;
  readonly logFile: string;
  readonly version: string;
  readonly binaryPath: string;
  readonly tunnelId: string | null;
}

export const decodeTunnelIdFromToken = (token: string): string | null => {
  try {
    const parts = token.split(".");
    const payloadB64 = parts.length === 3 ? parts[1] : token;
    if (!payloadB64) return null;
    const padded = payloadB64.padEnd(
      payloadB64.length + ((4 - (payloadB64.length % 4)) % 4),
      "=",
    );
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { t?: unknown };
    return typeof parsed.t === "string" ? parsed.t : null;
  } catch {
    return null;
  }
};

export const runConnect = async (
  params: ConnectModeParams,
): Promise<ConnectModeResult> => {
  const platform = detectPlatform();
  const requestedLatest = params.cloudflaredVersion.trim() === "latest";
  const version = await resolveVersion(params.cloudflaredVersion);
  log.info(`Using cloudflared ${version} for ${platform.os}/${platform.arch}`);

  // Allow a missing sha256 sidecar only when the user explicitly requested
  // "latest" — pinned versions must verify or fail closed.
  const binaryPath = await installCloudflared(version, platform, {
    allowMissingSidecar: requestedLatest,
  });

  const spawned = await spawnConnector({
    binaryPath,
    token: params.tunnelToken,
    loglevel: params.loglevel,
    metricsBind: params.metrics,
  });

  if (params.waitForConnections) {
    log.info(`Waiting for healthy connection at ${spawned.metricsUrl}/ready`);
    await waitForHealthy({
      metricsUrl: spawned.metricsUrl,
      timeoutSeconds: params.waitTimeoutSeconds,
    });
    log.info("Connector reports a healthy edge connection");
  }

  return {
    ...spawned,
    version,
    binaryPath,
    tunnelId: decodeTunnelIdFromToken(params.tunnelToken),
  };
};
