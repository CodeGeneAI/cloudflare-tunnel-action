import { CloudflareTunnelsClient } from "../cloudflare/api";
import type { CommonInputs } from "../inputs";
import * as log from "../util/log";
import { registerSecret } from "../util/log";

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

// `ensureTunnel` is split out so callers can persist a rollback state file
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
