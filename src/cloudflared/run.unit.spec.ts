import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseMetricsAddress, tailLog } from "./run";

describe("parseMetricsAddress", () => {
  test("matches IPv4 dotted-quad with /metrics suffix", () => {
    expect(
      parseMetricsAddress(
        "INF Starting metrics server on 127.0.0.1:54321/metrics",
      ),
    ).toBe("127.0.0.1:54321");
  });

  test("matches IPv6 loopback in brackets", () => {
    expect(
      parseMetricsAddress("Starting metrics server on [::1]:9876/metrics"),
    ).toBe("[::1]:9876");
  });

  test("matches unspecified IPv6 in brackets", () => {
    expect(
      parseMetricsAddress("Starting metrics server on [::]:9876/metrics"),
    ).toBe("[::]:9876");
  });

  test("matches tcp:// scheme variant without /metrics suffix", () => {
    expect(parseMetricsAddress("metrics server on tcp://127.0.0.1:9999")).toBe(
      "127.0.0.1:9999",
    );
  });

  test("returns null when no metrics line present", () => {
    expect(parseMetricsAddress("INF connecting to edge\n")).toBeNull();
  });

  test("returns first match when multiple metrics lines present", () => {
    const log =
      "Starting metrics server on 127.0.0.1:1111/metrics\nStarting metrics server on 127.0.0.1:2222/metrics\n";
    expect(parseMetricsAddress(log)).toBe("127.0.0.1:1111");
  });
});

describe("tailLog", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tail-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty string when file missing", () => {
    expect(tailLog(path.join(dir, "missing.log"), 10)).toBe("");
  });

  test("returns last N lines", () => {
    const file = path.join(dir, "x.log");
    fs.writeFileSync(file, ["a", "b", "c", "d", "e"].join("\n"));
    expect(tailLog(file, 2)).toBe("d\ne");
  });

  test("returns whole file if it has fewer lines than N", () => {
    const file = path.join(dir, "y.log");
    fs.writeFileSync(file, "only\nthese\n");
    expect(tailLog(file, 50)).toBe("only\nthese\n");
  });
});
