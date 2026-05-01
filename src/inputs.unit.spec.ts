import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseInputs } from "./inputs";
import { __resetSecretsForTesting } from "./util/log";

const ENV_KEYS = [
  "INPUT_MODE",
  "INPUT_TUNNEL-TOKEN",
  "INPUT_API-TOKEN",
  "INPUT_ACCOUNT-ID",
  "INPUT_TUNNEL-NAME",
  "INPUT_CLEANUP-ON-EXIT",
  "INPUT_CLOUDFLARED-VERSION",
  "INPUT_LOGLEVEL",
  "INPUT_METRICS",
  "INPUT_WAIT-FOR-CONNECTIONS",
  "INPUT_WAIT-TIMEOUT-SECONDS",
] as const;

const clearInputEnv = (): void => {
  for (const key of ENV_KEYS) delete process.env[key];
};

describe("parseInputs", () => {
  beforeEach(() => {
    clearInputEnv();
    __resetSecretsForTesting();
  });
  afterEach(() => {
    clearInputEnv();
    __resetSecretsForTesting();
  });

  test("connect mode requires tunnel-token", () => {
    process.env.INPUT_MODE = "connect";
    expect(() => parseInputs()).toThrow(/tunnel-token.*required/);
  });

  test("connect mode parses defaults", () => {
    process.env.INPUT_MODE = "connect";
    process.env["INPUT_TUNNEL-TOKEN"] = "abc";
    const inputs = parseInputs();
    expect(inputs.mode).toBe("connect");
    if (inputs.mode === "connect") {
      expect(inputs.tunnelToken).toBe("abc");
      expect(inputs.cloudflaredVersion).toBe("latest");
      expect(inputs.loglevel).toBe("info");
      expect(inputs.metrics).toBe("localhost:0");
      expect(inputs.waitForConnections).toBe(true);
      expect(inputs.waitTimeoutSeconds).toBe(60);
    }
  });

  test("create mode requires api-token, account-id, tunnel-name", () => {
    process.env.INPUT_MODE = "create";
    expect(() => parseInputs()).toThrow(/api-token.*required/);

    process.env["INPUT_API-TOKEN"] = "t";
    expect(() => parseInputs()).toThrow(/account-id.*required/);

    process.env["INPUT_ACCOUNT-ID"] = "acc";
    expect(() => parseInputs()).toThrow(/tunnel-name.*required/);
  });

  test("create mode parses fully", () => {
    process.env.INPUT_MODE = "create";
    process.env["INPUT_API-TOKEN"] = "tok";
    process.env["INPUT_ACCOUNT-ID"] = "acc";
    process.env["INPUT_TUNNEL-NAME"] = "ephemeral";
    process.env["INPUT_CLEANUP-ON-EXIT"] = "false";

    const inputs = parseInputs();
    expect(inputs.mode).toBe("create");
    if (inputs.mode === "create") {
      expect(inputs.apiToken).toBe("tok");
      expect(inputs.accountId).toBe("acc");
      expect(inputs.tunnelName).toBe("ephemeral");
      expect(inputs.cleanupOnExit).toBe(false);
    }
  });

  test("invalid mode throws", () => {
    process.env.INPUT_MODE = "weird";
    expect(() => parseInputs()).toThrow(/mode/);
  });

  test("mode is case-insensitive", () => {
    process.env.INPUT_MODE = "CONNECT";
    process.env["INPUT_TUNNEL-TOKEN"] = "abcdefghij";
    expect(parseInputs().mode).toBe("connect");

    delete process.env["INPUT_TUNNEL-TOKEN"];
    process.env.INPUT_MODE = "Create";
    process.env["INPUT_API-TOKEN"] = "tokenvalueabcdef";
    process.env["INPUT_ACCOUNT-ID"] = "acc";
    process.env["INPUT_TUNNEL-NAME"] = "name";
    expect(parseInputs().mode).toBe("create");
  });

  test("invalid loglevel throws", () => {
    process.env.INPUT_MODE = "connect";
    process.env["INPUT_TUNNEL-TOKEN"] = "abc";
    process.env.INPUT_LOGLEVEL = "verbose";
    expect(() => parseInputs()).toThrow(/loglevel/);
  });

  test("invalid wait-timeout-seconds throws", () => {
    process.env.INPUT_MODE = "connect";
    process.env["INPUT_TUNNEL-TOKEN"] = "abc";
    process.env["INPUT_WAIT-TIMEOUT-SECONDS"] = "0";
    expect(() => parseInputs()).toThrow(/wait-timeout-seconds/);
  });
});
