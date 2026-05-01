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

## Threat model

What this action defends:

- **Token disclosure in logs.** `tunnel-token` and `api-token` are passed
  to `core.setSecret()` the moment they are read so the runner-level mask
  redacts them in every step's log output. The action's own redactor runs
  on top with a minimum-length guard so short test values do not poison
  output. Tokens are never serialized to the on-disk state file (only the
  env-var name is). The captured cloudflared log is checked by CI for
  literal token leakage.
- **Connector-token re-use.** `tunnel-token` is intentionally **not** an
  action output, even masked, because outputs flow into `GITHUB_OUTPUT`
  where downstream steps that *transform* the value (base64, slice, hash)
  defeat masking. If a downstream job needs the connector token, pass it
  through `secrets:` rather than the workflow output store.
- **Orphan tunnel after a job failure.** If `mode=create` is used and the
  binary install or healthy-wait fails, a rollback state is persisted
  before the spawn so the post-step still has enough information to
  delete the tunnel via the API.

What this action does **not** defend against:

- **A malicious workflow YAML in the same repository.** Any other step in
  the same job can read `$RUNNER_TEMP/cloudflared-*.log` and
  `$RUNNER_TEMP/cf-tunnel-state-*.json`. State files are created with
  mode `0600`, but they live on a runner that the workflow already trusts.
  Treat the runner as a trust boundary — don't run untrusted code in the
  same job that holds your tunnel token.
- **API-token downgrade by setting `cleanup-on-exit: false`.** A
  workflow author who controls the inputs can opt out of cleanup and
  leave a long-lived tunnel under a chosen name. This is a feature, not
  a bug — it's how operators preserve tunnels across CI runs.
- **`pull_request_target` abuse.** This action is intentionally not
  designed to be safe under `pull_request_target` — secrets exposed to
  fork PRs that way can be exfiltrated by malicious diffs. The bundled
  self-test workflow gates explicitly on
  `head.repo.full_name == github.repository`.
- **Compromised cloudflared release artifacts.** As of 2026-05,
  cloudflared upstream does **not** publish per-asset `.sha256` sidecar
  files for any of its release binaries. This action attempts to fetch
  `<asset>.sha256` for every download, verifies the binary against it
  when present, and warns-and-continues when absent (the current upstream
  norm). If a future cloudflared release ships sidecars, verification
  becomes automatic. If you need stronger guarantees in the meantime,
  pin `cloudflared-version` to a tag whose binary hash you've audited
  out-of-band, fork this action, and add a known-good-hash check.

## Reporting cadence

We respond to acknowledged reports within 2 business days. High-severity
fixes ship within 14 days; lower severity ride the next normal release
cut.
