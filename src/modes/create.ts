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

export interface CreateModeResult extends ConnectModeResult {
  readonly tunnelId: string;
  readonly tunnelToken: string;
}

export const runCreate = async (
  params: CreateModeParams,
): Promise<CreateModeResult> => {
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

  const connectResult = await runConnect({
    cloudflaredVersion: params.cloudflaredVersion,
    loglevel: params.loglevel,
    metrics: params.metrics,
    waitForConnections: params.waitForConnections,
    waitTimeoutSeconds: params.waitTimeoutSeconds,
    tunnelToken,
  });

  return {
    ...connectResult,
    tunnelId: tunnel.id,
    tunnelToken,
  };
};
