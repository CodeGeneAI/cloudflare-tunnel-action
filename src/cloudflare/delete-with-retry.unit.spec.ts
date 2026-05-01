import { describe, expect, test } from "bun:test";
import { CloudflareTunnelsClient, type FetchLike } from "./api";
import { deleteTunnelWithRetry } from "./delete-with-retry";
import { CloudflareApiError } from "./errors";

const makeClient = (
  responses: ReadonlyArray<() => Promise<Response>>,
): CloudflareTunnelsClient => {
  let i = 0;
  const fetchImpl: FetchLike = async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!next) throw new Error("no more mocked responses");
    return next();
  };
  return new CloudflareTunnelsClient({
    accountId: "acc",
    managementToken: "tok",
    fetchImpl,
  });
};

const okEmpty = () =>
  Promise.resolve(
    new Response(JSON.stringify({ success: true, result: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

const activeConnectionsError = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 1, message: "tunnel has active connections" }],
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  );

const notFound = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 1000, message: "not found" }],
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    ),
  );

const fastPolicy = { maxAttempts: 3, delayMs: 1 } as const;

describe("deleteTunnelWithRetry", () => {
  test("succeeds on first try", async () => {
    const client = makeClient([okEmpty]);
    await expect(
      deleteTunnelWithRetry(client, "t-1", fastPolicy),
    ).resolves.toBeUndefined();
  });

  test("treats 404 as success", async () => {
    const client = makeClient([notFound]);
    await expect(
      deleteTunnelWithRetry(client, "t-1", fastPolicy),
    ).resolves.toBeUndefined();
  });

  test("retries on active-connections then succeeds", async () => {
    const client = makeClient([
      activeConnectionsError,
      okEmpty, // cleanupConnections
      okEmpty, // delete retry
    ]);
    await expect(
      deleteTunnelWithRetry(client, "t-1", fastPolicy),
    ).resolves.toBeUndefined();
  });

  test("gives up after maxAttempts on persistent active-connections", async () => {
    const client = makeClient([
      activeConnectionsError,
      okEmpty,
      activeConnectionsError,
      okEmpty,
      activeConnectionsError,
    ]);
    await expect(
      deleteTunnelWithRetry(client, "t-1", fastPolicy),
    ).rejects.toBeInstanceOf(CloudflareApiError);
  });
});
