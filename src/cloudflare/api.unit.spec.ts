import { describe, expect, test } from "bun:test";
import { CloudflareTunnelsClient, type FetchLike } from "./api";
import { CloudflareApiError } from "./errors";

const ok = (body: unknown): Response =>
  new Response(JSON.stringify({ success: true, result: body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const fail = (
  status: number,
  errors: { code?: number; message?: string }[],
): Response =>
  new Response(JSON.stringify({ success: false, errors }), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("CloudflareTunnelsClient", () => {
  test("list returns mapped tunnels", async () => {
    const fetchImpl = async () =>
      ok([{ id: "t-1", name: "alpha", status: "healthy" }]);
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    const result = await client.list();
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("t-1");
    expect(result[0]?.name).toBe("alpha");
  });

  test("list throws when result is non-array", async () => {
    const fetchImpl = async () => ok({ not: "array" });
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    await expect(client.list()).rejects.toThrow(/non-array/);
  });

  test("create posts the right body", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const fetchImpl: FetchLike = async (url, init) => {
      captured = { url, init };
      return ok({ id: "t-2", name: "beta" });
    };
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    const tunnel = await client.create("beta");
    expect(tunnel.id).toBe("t-2");
    expect(captured.url).toContain("/accounts/acc/cfd_tunnel");
    const body = JSON.parse(String(captured.init?.body)) as Record<
      string,
      unknown
    >;
    expect(body.name).toBe("beta");
    expect(body.config_src).toBe("cloudflare");
  });

  test("getToken returns the token string", async () => {
    const fetchImpl = async () => ok("connector-token-value");
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    expect(await client.getToken("t-1")).toBe("connector-token-value");
  });

  test("delete throws CloudflareApiError on 404", async () => {
    const fetchImpl = async () =>
      fail(404, [{ code: 1000, message: "not found" }]);
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    await expect(client.delete("t-x")).rejects.toBeInstanceOf(
      CloudflareApiError,
    );
  });

  test("delete throws active-connections on 400", async () => {
    const fetchImpl = async () =>
      fail(400, [{ code: 1, message: "tunnel has active connections" }]);
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    try {
      await client.delete("t-x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CloudflareApiError);
      expect((e as CloudflareApiError).messages.join(",")).toMatch(
        /active connections/,
      );
    }
  });

  test("non-JSON response wraps body into envelope", async () => {
    const fetchImpl = async () => new Response("rate limited", { status: 429 });
    const client = new CloudflareTunnelsClient({
      accountId: "acc",
      managementToken: "tok",
      fetchImpl,
    });
    try {
      await client.list();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CloudflareApiError);
      expect((e as CloudflareApiError).status).toBe(429);
    }
  });
});
