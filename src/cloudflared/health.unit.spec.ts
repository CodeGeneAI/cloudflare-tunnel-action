import { describe, expect, test } from "bun:test";
import type { FetchLike } from "../cloudflare/api";
import { waitForHealthy } from "./health";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("waitForHealthy", () => {
  test("returns when readyConnections >= 1 and probes /ready", async () => {
    let calls = 0;
    const calledUrls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls += 1;
      calledUrls.push(url);
      return jsonResponse(200, { readyConnections: calls >= 2 ? 1 : 0 });
    };
    await expect(
      waitForHealthy({
        metricsUrl: "http://127.0.0.1:1234",
        timeoutSeconds: 2,
        intervalMs: 5,
        fetchImpl,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calledUrls[0]).toBe("http://127.0.0.1:1234/ready");
  });

  test("strips trailing slash before composing /ready", async () => {
    let url = "";
    const fetchImpl: FetchLike = async (u) => {
      url = u;
      return jsonResponse(200, { readyConnections: 1 });
    };
    await waitForHealthy({
      metricsUrl: "http://127.0.0.1:1234/",
      timeoutSeconds: 2,
      intervalMs: 5,
      fetchImpl,
    });
    expect(url).toBe("http://127.0.0.1:1234/ready");
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
