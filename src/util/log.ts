import * as core from "@actions/core";

const secrets = new Set<string>();

export const registerSecret = (value: string): void => {
  if (value.length === 0) return;
  secrets.add(value);
  core.setSecret(value);
};

const redact = (message: string): string => {
  let out = message;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    out = out.split(secret).join("***");
  }
  return out;
};

export const info = (message: string): void => core.info(redact(message));
export const warning = (message: string): void => core.warning(redact(message));
export const error = (message: string): void => core.error(redact(message));
export const debug = (message: string): void => core.debug(redact(message));
