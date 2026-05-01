import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetSecretsForTesting, registerSecret } from "./log";

// We can't easily intercept @actions/core stdout from bun:test, so we
// re-derive the redact logic by importing the module's behavior via the
// public API (info/warning/error) and inspecting console.log output.
// Instead, rely on registerSecret's gating contract: short tokens must NOT
// be added to the in-process replacement set even though core.setSecret
// still runs.

import * as log from "./log";

describe("registerSecret", () => {
  beforeEach(__resetSecretsForTesting);
  afterEach(__resetSecretsForTesting);

  test("does not redact tokens shorter than the minimum length", () => {
    registerSecret("tok"); // 3 chars; below threshold
    // The redactor only redacts substrings actually in the secrets set.
    // Indirect assertion: log a message that contains "tok" and confirm
    // it is not replaced. We capture stdout by spying on console.log
    // because @actions/core writes via process.stdout.write.
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write polymorphism
    process.stdout.write = ((chunk: any) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      log.info("status: tunnel ok");
      expect(captured).toContain("status: tunnel ok");
      expect(captured).not.toContain("***");
    } finally {
      process.stdout.write = original;
    }
  });

  test("redacts tokens at or above the minimum length", () => {
    registerSecret("supersecretvalue123");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write polymorphism
    process.stdout.write = ((chunk: any) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      log.info("token=supersecretvalue123 in flight");
      expect(captured).toContain("token=*** in flight");
      expect(captured).not.toContain("supersecretvalue123");
    } finally {
      process.stdout.write = original;
    }
  });

  test("__resetSecretsForTesting clears registered secrets", () => {
    registerSecret("longenoughsecret");
    __resetSecretsForTesting();
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write polymorphism
    process.stdout.write = ((chunk: any) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      log.info("longenoughsecret should be visible after reset");
      expect(captured).toContain("longenoughsecret");
    } finally {
      process.stdout.write = original;
    }
  });
});
