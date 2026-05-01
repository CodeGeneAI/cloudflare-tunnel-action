import * as core from "@actions/core";

const secrets = new Set<string>();

// Below this length the in-process redactor would mangle innocuous log output
// (a 3-character secret would replace every occurrence of those characters).
// `core.setSecret` still applies its own runner-level masking — we just opt
// out of the substring rewrite for short tokens.
const MIN_REDACTABLE_LENGTH = 8;

export const registerSecret = (value: string): void => {
  if (value.length === 0) return;
  core.setSecret(value);
  if (value.length >= MIN_REDACTABLE_LENGTH) {
    secrets.add(value);
  }
};

// Test-only: callers should never reach into the secrets set in production.
// Bun's test runner shares a process across spec files, so without a reset
// hook secrets registered by `parseInputs` in one spec leak into log output
// from later specs and obscure unrelated assertions.
export const __resetSecretsForTesting = (): void => {
  secrets.clear();
};

const redact = (message: string): string => {
  if (secrets.size === 0) return message;
  let out = message;
  for (const secret of secrets) out = out.split(secret).join("***");
  return out;
};

export const info = (message: string): void => core.info(redact(message));
export const warning = (message: string): void => core.warning(redact(message));
export const error = (message: string): void => core.error(redact(message));
export const debug = (message: string): void => core.debug(redact(message));
