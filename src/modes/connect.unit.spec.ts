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
});
