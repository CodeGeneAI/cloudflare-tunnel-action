import { describe, expect, test } from "bun:test";
import { detectPlatform } from "./platform";

describe("detectPlatform", () => {
  test("linux x64", () => {
    const p = detectPlatform("linux", "x64");
    expect(p.assetName).toBe("cloudflared-linux-amd64");
    expect(p.needsExtract).toBe(false);
    expect(p.exeSuffix).toBe("");
  });

  test("linux arm64", () => {
    const p = detectPlatform("linux", "arm64");
    expect(p.assetName).toBe("cloudflared-linux-arm64");
    expect(p.needsExtract).toBe(false);
  });

  test("darwin x64", () => {
    const p = detectPlatform("darwin", "x64");
    expect(p.assetName).toBe("cloudflared-darwin-amd64.tgz");
    expect(p.needsExtract).toBe(true);
  });

  test("darwin arm64", () => {
    const p = detectPlatform("darwin", "arm64");
    expect(p.assetName).toBe("cloudflared-darwin-arm64.tgz");
    expect(p.needsExtract).toBe(true);
  });

  test("windows is rejected with a clear message", () => {
    expect(() => detectPlatform("win32", "x64")).toThrow(
      /Windows.*not supported/,
    );
  });

  test("unknown architecture throws", () => {
    expect(() => detectPlatform("linux", "ia32")).toThrow(/architecture/);
  });
});
