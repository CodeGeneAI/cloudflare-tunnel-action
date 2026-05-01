import { describe, expect, test } from "bun:test";
import { detectPlatform } from "./platform";

describe("detectPlatform", () => {
  test("linux x64", () => {
    const p = detectPlatform("linux", "x64");
    expect(p.assetName).toBe("cloudflared-linux-amd64");
    expect(p.exeSuffix).toBe("");
  });

  test("linux arm64", () => {
    const p = detectPlatform("linux", "arm64");
    expect(p.assetName).toBe("cloudflared-linux-arm64");
  });

  test("macOS is rejected with a clear v1.1 message", () => {
    expect(() => detectPlatform("darwin", "x64")).toThrow(
      /macOS.*not supported.*v1\.1/,
    );
    expect(() => detectPlatform("darwin", "arm64")).toThrow(
      /macOS.*not supported.*v1\.1/,
    );
  });

  test("Windows is rejected with a clear message", () => {
    expect(() => detectPlatform("win32", "x64")).toThrow(
      /Windows.*not supported/,
    );
  });

  test("unknown architecture on linux throws", () => {
    expect(() => detectPlatform("linux", "ia32")).toThrow(/architecture/);
  });
});
