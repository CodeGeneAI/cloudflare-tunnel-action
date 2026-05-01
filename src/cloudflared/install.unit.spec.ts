import { describe, expect, test } from "bun:test";
import { decideCacheUse, parseSha256Sidecar } from "./install";

describe("parseSha256Sidecar", () => {
  test("returns lowercased digest from bare-digest format", () => {
    const hex = "a".repeat(64);
    expect(parseSha256Sidecar(hex)).toBe(hex);
  });

  test('returns digest from "<digest>  <filename>" format', () => {
    const hex = "B".repeat(64);
    expect(parseSha256Sidecar(`${hex}  cloudflared-linux-amd64`)).toBe(
      hex.toLowerCase(),
    );
  });

  test("trims surrounding whitespace before parsing", () => {
    const hex = "f".repeat(64);
    expect(parseSha256Sidecar(`\n  ${hex}\n\n`)).toBe(hex);
  });

  test("returns null for non-hex content", () => {
    expect(parseSha256Sidecar("not-a-digest")).toBeNull();
  });

  test("returns null for too-short hex", () => {
    expect(parseSha256Sidecar("abc123")).toBeNull();
  });

  test("returns null for empty input", () => {
    expect(parseSha256Sidecar("")).toBeNull();
  });
});

describe("decideCacheUse", () => {
  test("hash matches → use", () => {
    expect(decideCacheUse("a".repeat(64), "a".repeat(64), false)).toBe("use");
    expect(decideCacheUse("a".repeat(64), "a".repeat(64), true)).toBe("use");
  });

  test("hash mismatches → redownload regardless of allowMissingSidecar", () => {
    expect(decideCacheUse("a".repeat(64), "b".repeat(64), false)).toBe(
      "redownload",
    );
    expect(decideCacheUse("a".repeat(64), "b".repeat(64), true)).toBe(
      "redownload",
    );
  });

  test("no sidecar + allowMissingSidecar=true → use (latest mode)", () => {
    expect(decideCacheUse(null, null, true)).toBe("use");
  });

  test("no sidecar + allowMissingSidecar=false → redownload (pinned mode)", () => {
    expect(decideCacheUse(null, null, false)).toBe("redownload");
  });
});
