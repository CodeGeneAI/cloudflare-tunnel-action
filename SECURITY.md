# Security Policy

## Reporting a vulnerability

Please report suspected security issues privately to **security@codegene.ai**
or via GitHub's [private vulnerability reporting][pvr] on this repository.

[pvr]: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability

Please do **not** open a public issue for security reports. We aim to
acknowledge within 2 business days and ship a fix within 14 days for
high-severity issues.

## Scope

In scope:

- The action source under `src/`.
- The bundled output under `dist/`.
- The CI workflows under `.github/workflows/`.

Out of scope:

- The upstream `cloudflared` binary (report to <https://github.com/cloudflare/cloudflared>).
- The Cloudflare API itself (report to Cloudflare via <https://hackerone.com/cloudflare>).

## Secret handling

- `tunnel-token` and `api-token` inputs are masked via `core.setSecret()`
  the moment they are read.
- The masked `tunnel-token` output (in `mode=create`) is masked before
  being set so downstream steps do not log it.
- The on-disk state file at `$RUNNER_TEMP/cf-tunnel-state.json` records
  only the env-var **name** that holds the API token, never the token
  value.
- The captured cloudflared log is checked by CI for accidental token
  leakage.
