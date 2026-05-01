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

export interface SpawnResult {
  readonly pid: number;
  readonly metricsUrl: string;
  readonly logFile: string;
  readonly version: string;
  readonly binaryPath: string;
  readonly tunnelId: string | null;
}

export interface ConnectModeResult extends SpawnResult {}

export const decodeTunnelIdFromToken = (token: string): string | null => {
  try {
    const parts = token.split(".");
    const payloadB64 = parts.length === 3 ? parts[1] : token;
    if (!payloadB64) return null;
    // Cloudflare connector tokens (and JWT payloads) are base64url-encoded —
    // `-` and `_` instead of `+` and `/`, with optional padding. Translate
    // back to standard base64 before handing to Buffer. Node's
    // Buffer.from('base64') happens to accept the URL-safe alphabet
    // already, so this is defensive: it keeps the function correct under
    // a stricter decoder (atob, a polyfill, a future runtime change).
    const standard = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard.padEnd(
      standard.length + ((4 - (standard.length % 4)) % 4),
      "=",
    );
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { t?: unknown };
    return typeof parsed.t === "string" ? parsed.t : null;
  } catch {
    return null;
  }
};

// Step A: install + spawn. Returns the running pid as soon as the connector
// has reported a metrics address. Caller is expected to persist this state
// BEFORE invoking `waitConnectorHealthy` so that a healthy-wait timeout
// still leaves the post-step enough information to SIGTERM the connector.
export const installAndSpawn = async (
  params: ConnectModeParams,
): Promise<SpawnResult> => {
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

  return {
    ...spawned,
    version,
    binaryPath,
    tunnelId: decodeTunnelIdFromToken(params.tunnelToken),
  };
};

// Step B: optionally block until the connector reports a healthy edge
// connection. If this throws, the caller has already persisted the pid in
// step A and the post-step will SIGTERM the orphaned process.
export const waitConnectorHealthy = async (
  params: ConnectModeParams,
  metricsUrl: string,
): Promise<void> => {
  if (!params.waitForConnections) return;
  log.info(`Waiting for healthy connection at ${metricsUrl}/ready`);
  await waitForHealthy({
    metricsUrl,
    timeoutSeconds: params.waitTimeoutSeconds,
  });
  log.info("Connector reports a healthy edge connection");
};
