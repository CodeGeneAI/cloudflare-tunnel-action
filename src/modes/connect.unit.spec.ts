import { describe, expect, test } from "bun:test";
import { decodeTunnelIdFromToken } from "./connect";

const b64url = (s: string): string =>
  Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

describe("decodeTunnelIdFromToken", () => {
  test("returns null for non-token strings", () => {
    expect(decodeTunnelIdFromToken("")).toBeNull();
    expect(decodeTunnelIdFromToken("not-a-token")).toBeNull();
  });

  test("returns null when JSON has no 't' field", () => {
    const payload = b64url(JSON.stringify({ a: "acc", s: "secret" }));
    expect(decodeTunnelIdFromToken(payload)).toBeNull();
  });

  test("returns null when 't' is not a string", () => {
    const payload = b64url(JSON.stringify({ t: 123 }));
    expect(decodeTunnelIdFromToken(payload)).toBeNull();
  });

  test("decodes the 't' field from a single-segment token", () => {
    const payload = b64url(
      JSON.stringify({ a: "acc", t: "abc-123", s: "secret" }),
    );
    expect(decodeTunnelIdFromToken(payload)).toBe("abc-123");
  });

  test("decodes the 't' field from a JWT-shaped 3-segment token", () => {
    const header = b64url(JSON.stringify({ alg: "HS256" }));
    const payload = b64url(JSON.stringify({ t: "jwt-tunnel" }));
    const sig = "fake";
    expect(decodeTunnelIdFromToken(`${header}.${payload}.${sig}`)).toBe(
      "jwt-tunnel",
    );
  });

  test("tolerates malformed base64 without throwing", () => {
    expect(decodeTunnelIdFromToken("@@@.@@@.@@@")).toBeNull();
  });

  test("decodes base64url-encoded payloads (- and _ characters)", () => {
    // The decoder maps URL-safe `-`/`_` back to standard `+`/`/` before
    // Buffer.from. Force a payload whose standard base64 reliably contains
    // those URL-unsafe chars so the translation path is actually exercised.
    // `~` (0x7e) tripled produces standard base64 `fn5+`, so a run of
    // tildes guarantees `+` characters; `ÿÿ` adds bytes that
    // commonly produce `/` too.
    const tValue = "tunnel~~~~~~~~~ÿÿ";
    const standard = Buffer.from(
      JSON.stringify({ t: tValue }),
      "utf8",
    ).toString("base64");
    // Real assertion (no `^` alternation): standard form must contain at
    // least one URL-unsafe character so the translation is non-trivial.
    expect(standard).toMatch(/[+/]/);
    const urlSafe = standard
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(decodeTunnelIdFromToken(urlSafe)).toBe(tValue);
  });
});
