import type { FetchLike } from "../cloudflare/api";
import { sleep } from "../util/sleep";

export interface WaitForHealthyParams {
  readonly metricsUrl: string;
  readonly timeoutSeconds: number;
  readonly fetchImpl?: FetchLike;
  readonly intervalMs?: number;
}

export const waitForHealthy = async (
  params: WaitForHealthyParams,
): Promise<void> => {
  const fetchImpl: FetchLike =
    params.fetchImpl ?? ((url, init) => fetch(url, init));
  const intervalMs = params.intervalMs ?? 1000;
  const deadline = Date.now() + params.timeoutSeconds * 1000;
  const url = `${params.metricsUrl.replace(/\/$/, "")}/ready`;

  let lastError: string | null = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url, { method: "GET" });
      if (response.ok) {
        const body = (await response.json()) as { readyConnections?: unknown };
        if (
          typeof body.readyConnections === "number" &&
          body.readyConnections >= 1
        ) {
          return;
        }
        lastError = `readyConnections=${String(body.readyConnections)}`;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `cloudflared connector did not become healthy within ${params.timeoutSeconds}s (last: ${lastError ?? "no response"})`,
  );
};
