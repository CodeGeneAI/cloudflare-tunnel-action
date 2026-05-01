import { describe, expect, test } from "bun:test";
import type { FetchLike } from "../cloudflare/api";
import { resolveVersion } from "./version";

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("resolveVersion", () => {
  test("returns concrete tag unchanged", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("should not call fetch for concrete tag");
    };
    expect(await resolveVersion("2026.3.0", fetchImpl)).toBe("2026.3.0");
  });

  test("trims whitespace on concrete tag", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("should not call fetch");
    };
    expect(await resolveVersion("  2026.3.0  ", fetchImpl)).toBe("2026.3.0");
  });

  test("hits GitHub releases for 'latest'", async () => {
    let captured = "";
    const fetchImpl: FetchLike = async (url) => {
      captured = url;
      return ok({ tag_name: "2026.4.1" });
    };
    expect(await resolveVersion("latest", fetchImpl)).toBe("2026.4.1");
    expect(captured).toContain("cloudflare/cloudflared/releases/latest");
  });

  test("hits GitHub releases for empty input", async () => {
    const fetchImpl: FetchLike = async () => ok({ tag_name: "2026.4.1" });
    expect(await resolveVersion("", fetchImpl)).toBe("2026.4.1");
  });

  test("throws when GitHub returns non-rate-limit error", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("server error", { status: 500 });
    await expect(resolveVersion("latest", fetchImpl)).rejects.toThrow(/500/);
  });

  test("retries once on 403 rate-limit and then succeeds", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) return new Response("forbidden", { status: 403 });
      return ok({ tag_name: "2026.4.1" });
    };
    expect(
      await resolveVersion("latest", {
        fetchImpl,
        rateLimitRetryDelayMs: 1,
        rateLimitMaxAttempts: 2,
      }),
    ).toBe("2026.4.1");
    expect(calls).toBe(2);
  });

  test("gives up after rate-limit max attempts", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("forbidden", { status: 403 });
    await expect(
      resolveVersion("latest", {
        fetchImpl,
        rateLimitRetryDelayMs: 1,
        rateLimitMaxAttempts: 2,
      }),
    ).rejects.toThrow(/403/);
  });

  test("throws when tag_name missing from response", async () => {
    const fetchImpl: FetchLike = async () => ok({ no_tag: "x" });
    await expect(resolveVersion("latest", fetchImpl)).rejects.toThrow(
      /missing tag_name/,
    );
  });
});
