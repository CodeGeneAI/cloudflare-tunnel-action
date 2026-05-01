import { CloudflareTunnelsClient } from "../cloudflare/api";
import type { CommonInputs } from "../inputs";
import * as log from "../util/log";
import { registerSecret } from "../util/log";
import { type ConnectModeResult, runConnect } from "./connect";

export interface CreateModeParams extends CommonInputs {
  readonly apiToken: string;
  readonly accountId: string;
  readonly tunnelName: string;
}

export interface EnsuredTunnel {
  readonly tunnelId: string;
  readonly tunnelToken: string;
  readonly created: boolean;
}

export interface CreateModeResult extends ConnectModeResult {
  readonly tunnelId: string;
  readonly tunnelToken: string;
}

// Tunnel ensure is split out so callers can persist a rollback state file
// immediately after the API succeeds, BEFORE the connector is spawned.
// If anything later (binary install, spawn, healthy wait) throws, the
// post-step still has enough information to delete the tunnel.
export const ensureTunnel = async (
  params: CreateModeParams,
): Promise<EnsuredTunnel> => {
  const client = new CloudflareTunnelsClient({
    accountId: params.accountId,
    managementToken: params.apiToken,
  });

  const existing = await client.list();
  const found = existing.find((t) => t.name === params.tunnelName);
  const tunnel = found ?? (await client.create(params.tunnelName));
  log.info(
    found
      ? `Reusing existing tunnel "${params.tunnelName}" (${tunnel.id})`
      : `Created tunnel "${params.tunnelName}" (${tunnel.id})`,
  );

  const tunnelToken = await client.getToken(tunnel.id);
  registerSecret(tunnelToken);

  return { tunnelId: tunnel.id, tunnelToken, created: !found };
};

export const runCreate = async (
  params: CreateModeParams,
  ensured: EnsuredTunnel,
): Promise<CreateModeResult> => {
  const connectResult = await runConnect({
    cloudflaredVersion: params.cloudflaredVersion,
    loglevel: params.loglevel,
    metrics: params.metrics,
    waitForConnections: params.waitForConnections,
    waitTimeoutSeconds: params.waitTimeoutSeconds,
    tunnelToken: ensured.tunnelToken,
  });

  return {
    ...connectResult,
    tunnelId: ensured.tunnelId,
    tunnelToken: ensured.tunnelToken,
  };
};
