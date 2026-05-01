import { describe, expect, test } from "bun:test";
import type { FetchLike } from "../cloudflare/api";
import { waitForHealthy } from "./health";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("waitForHealthy", () => {
  test("returns when readyConnections >= 1", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return jsonResponse(200, { readyConnections: calls >= 2 ? 1 : 0 });
    };
    await expect(
      waitForHealthy({
        metricsUrl: "http://127.0.0.1:0",
        timeoutSeconds: 2,
        intervalMs: 5,
        fetchImpl,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("times out when never healthy", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(200, { readyConnections: 0 });
    await expect(
      waitForHealthy({
        metricsUrl: "http://127.0.0.1:0",
        timeoutSeconds: 0.05,
        intervalMs: 5,
        fetchImpl,
      }),
    ).rejects.toThrow(/did not become healthy/);
  });

  test("propagates 5xx to last error and times out", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(503, { readyConnections: 0 });
    await expect(
      waitForHealthy({
        metricsUrl: "http://127.0.0.1:0",
        timeoutSeconds: 0.05,
        intervalMs: 5,
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
