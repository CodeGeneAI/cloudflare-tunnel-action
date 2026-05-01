import { describe, expect, test } from "bun:test";
import {
  CloudflareApiError,
  isCloudflareNotFoundError,
  isCloudflareTunnelActiveConnectionsError,
  isRetryableTransientError,
} from "./errors";

const makeApiError = (
  status: number,
  messages: readonly string[] = [],
): CloudflareApiError =>
  new CloudflareApiError({ status, method: "GET", path: "/x", messages });

describe("isCloudflareTunnelActiveConnectionsError", () => {
  test("matches CloudflareApiError with active-connections message", () => {
    expect(
      isCloudflareTunnelActiveConnectionsError(
        makeApiError(400, ["tunnel has active connections"]),
      ),
    ).toBe(true);
  });

  test("matches plain Error with the phrase", () => {
    expect(
      isCloudflareTunnelActiveConnectionsError(
        new Error("something something active connections something"),
      ),
    ).toBe(true);
  });

  test("does not match unrelated error", () => {
    expect(
      isCloudflareTunnelActiveConnectionsError(makeApiError(500, ["boom"])),
    ).toBe(false);
  });
});

describe("isCloudflareNotFoundError", () => {
  test("matches 404 CloudflareApiError", () => {
    expect(isCloudflareNotFoundError(makeApiError(404, ["nope"]))).toBe(true);
  });
  test("does not match other statuses", () => {
    expect(isCloudflareNotFoundError(makeApiError(500))).toBe(false);
  });
  test("does not match plain Error", () => {
    expect(isCloudflareNotFoundError(new Error("404 not found"))).toBe(false);
  });
});

describe("isRetryableTransientError", () => {
  test.each([500, 502, 503, 504, 429])("matches Cloudflare %i", (status) => {
    expect(isRetryableTransientError(makeApiError(status))).toBe(true);
  });

  test("does not match Cloudflare 4xx (non-429)", () => {
    expect(isRetryableTransientError(makeApiError(400))).toBe(false);
    expect(isRetryableTransientError(makeApiError(403))).toBe(false);
    expect(isRetryableTransientError(makeApiError(404))).toBe(false);
  });

  test("matches Error with retryable network code", () => {
    const e = new Error("connection reset");
    (e as Error & { code: string }).code = "ECONNRESET";
    expect(isRetryableTransientError(e)).toBe(true);
  });

  test("matches Error with retryable cause.code (undici-shaped)", () => {
    const e = new Error("fetch failed");
    (e as Error & { cause: { code: string } }).cause = {
      code: "UND_ERR_SOCKET",
    };
    expect(isRetryableTransientError(e)).toBe(true);
  });

  test("matches AbortError by name", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(isRetryableTransientError(e)).toBe(true);
  });

  test('matches generic "fetch failed" message', () => {
    expect(isRetryableTransientError(new Error("fetch failed"))).toBe(true);
  });

  test("does NOT match TypeError (programming bug must surface)", () => {
    expect(
      isRetryableTransientError(new TypeError("x is not a function")),
    ).toBe(false);
  });

  test("does NOT match a generic message-less Error", () => {
    expect(isRetryableTransientError(new Error("oops"))).toBe(false);
  });

  test("does not match non-Error values", () => {
    expect(isRetryableTransientError("string")).toBe(false);
    expect(isRetryableTransientError(null)).toBe(false);
    expect(isRetryableTransientError(undefined)).toBe(false);
  });
});
