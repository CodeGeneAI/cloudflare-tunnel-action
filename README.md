# Cloudflare Tunnel Action

[![ci](https://github.com/CodeGeneAI/cloudflare-tunnel-action/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CodeGeneAI/cloudflare-tunnel-action/actions/workflows/ci.yml)
[![self-test](https://github.com/CodeGeneAI/cloudflare-tunnel-action/actions/workflows/self-test.yml/badge.svg?branch=main)](https://github.com/CodeGeneAI/cloudflare-tunnel-action/actions/workflows/self-test.yml)
[![release](https://img.shields.io/github/v/release/CodeGeneAI/cloudflare-tunnel-action?display_name=tag&sort=semver)](https://github.com/CodeGeneAI/cloudflare-tunnel-action/releases)
[![license](https://img.shields.io/github/license/CodeGeneAI/cloudflare-tunnel-action)](./LICENSE)

> Run a [cloudflared](https://github.com/cloudflare/cloudflared) connector
> on a GitHub Actions runner so the job can reach **private origins**
> behind Cloudflare Tunnel — Access-protected Railway services, internal
> HTTP services, preview-environment databases, and so on. Maintained by
> CodeGeneAI; not affiliated with Cloudflare.

## Why use this

You have CI work that needs to talk to a service that is not exposed to
the public internet. Spinning up a Cloudflare Tunnel connector on the
runner gives that job a private path through Cloudflare's edge into your
network for the duration of the job — no inbound firewall rules, no
public DNS, no shared bastion.

This action covers two real workflows:

- **`connect`** — you already have a tunnel; the runner just needs to
  attach a connector to it for a job. One secret (`TUNNEL_TOKEN`).
- **`create`** — the runner provisions an ephemeral tunnel via the
  Cloudflare API, attaches to it, and tears it down on exit. Useful when
  every PR gets its own short-lived environment.

## Quick start

### Connect to an existing tunnel

```yaml
- uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    mode: connect
    tunnel-token: ${{ secrets.CLOUDFLARE_TUNNEL_TOKEN }}

- run: curl --fail https://internal.example.com/health
```

### Create an ephemeral tunnel for the duration of a job

```yaml
- id: tunnel
  uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    mode: create
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    # A unique-per-run name avoids cross-job collisions.
    tunnel-name: gh-${{ github.run_id }}-${{ github.run_attempt }}

- run: echo "Tunnel CNAME ${{ steps.tunnel.outputs.tunnel-cname }}"
```

The post-step deletes the tunnel automatically (set
`cleanup-on-exit: "false"` to keep it).

## Inputs

| Input                  | Required when    | Default       | Description |
| ---------------------- | ---------------- | ------------- | ----------- |
| `mode`                 | always           | `connect`     | `connect` or `create`. |
| `tunnel-token`         | `mode=connect`   | —             | Connector token for an existing tunnel. |
| `api-token`            | `mode=create`    | —             | Cloudflare API token. Scope: **Account → Cloudflare Tunnel → Edit**. |
| `account-id`           | `mode=create`    | —             | Cloudflare account ID. |
| `tunnel-name`          | `mode=create`    | —             | Tunnel name. Use a per-run name. |
| `cleanup-on-exit`      | optional         | `true`        | When `mode=create`, delete the tunnel in the post-step. |
| `cloudflared-version`  | optional         | `2026.3.0`    | Release tag (e.g. `2026.3.0`) or `latest`. Pinned for reproducibility. |
| `loglevel`             | optional         | `info`        | cloudflared `--loglevel`. Use `debug` to troubleshoot. |
| `metrics`              | optional         | `localhost:0` | Bind for cloudflared `--metrics`. `:0` picks a free port. |
| `wait-for-connections` | optional         | `true`        | Block the step until at least one healthy edge connection. |
| `wait-timeout-seconds` | optional         | `60`          | Maximum wait for healthy connection. |

## Outputs

| Output         | Description |
| -------------- | ----------- |
| `tunnel-id`    | Tunnel UUID. Always set in `mode=create`. In `mode=connect` this is best-effort decoded from the token; opaque tokens leave it empty. |
| `tunnel-cname` | `{tunnel-id}.cfargotunnel.com`. Empty when `tunnel-id` is unknown. |
| `metrics-url`  | The cloudflared metrics URL (e.g. `http://127.0.0.1:NNN`). Useful for downstream `/ready` or `/metrics` probes. |

`tunnel-token` is intentionally **not** an output. Carry it forward via
`secrets` if a downstream step needs it — that keeps it out of the
workflow's output store entirely.

## Required Cloudflare API token scopes (`mode=create`)

Create a token at <https://dash.cloudflare.com/profile/api-tokens> with:

- **Account → Cloudflare Tunnel → Edit**

That single permission covers list, create, delete, get-token, and
cleanup-connections.

## Versioning

Pin to the moving major tag:

```yaml
- uses: CodeGeneAI/cloudflare-tunnel-action@v1
```

`@v1` follows the latest `v1.x.y` release. We also publish a moving
`v1.MINOR` tag and immutable `v1.MINOR.PATCH` tags — pin the immutable
tag if you want bit-for-bit reproducibility, or `@v1` if you want
patches and minor releases automatically.

Releases are driven by [release-please][rp] from conventional commits;
[CHANGELOG.md](./CHANGELOG.md) records every change. Breaking changes
will only ship on a new major (`v2`).

[rp]: https://github.com/googleapis/release-please-action

## Using multiple connectors in one job

Two `uses:` of this action in the same job each spawn their own
cloudflared and write a per-process state file
(`cf-tunnel-state-<pid>.json` under `$RUNNER_TEMP`). The single
post-step globs the directory and tears down every connector + tunnel
the job spawned, so multi-instance use is supported and isolated.

## Architecture

1. The action downloads `cloudflared` from the upstream GitHub releases
   (SHA-256 verified, cached per version+arch via `@actions/tool-cache`).
2. It spawns `cloudflared --loglevel <…> --metrics <bind> tunnel
   --no-autoupdate run --token <…>` as a detached child.
3. When `wait-for-connections=true`, it polls the connector's `/ready`
   metrics endpoint until one edge connection is registered.
4. The post-step sends `SIGTERM`, drains for up to 30s, then `SIGKILL`.
   In `create` mode it also deletes the tunnel via the API, retrying on
   active-connections (with `cleanupConnections`) and transient 5xx /
   429 / network errors (12 attempts × 5s by default).
5. State lives in per-process files
   `$RUNNER_TEMP/cf-tunnel-state-<pid>.json`. The post-step globs the
   directory and tears down every connector + tunnel that the job spawned
   (so two `uses:` of this action in one job each clean up their own).
   Tokens are never serialized — only the env-var name is.

## Supported platforms

- `ubuntu-latest`, `ubuntu-24.04-arm` (Linux x64 / arm64)
- `macos-latest`, `macos-13` (macOS arm64 / x64)
- **Windows is not supported in v1.** Planned for v1.1.

The action runtime is `node24`, which requires GitHub Actions runner
**v2.328.0 or newer** (the default on hosted runners since 2026-03-04).
Self-hosted runners must be upgraded.

## FAQ

**`Input "tunnel-token" is required when mode=connect`**
You set `mode: connect` (or used the default) but did not pass `with:
tunnel-token: ${{ secrets.… }}`. Either pass the token or switch to
`mode: create` with API credentials.

**Connector never becomes healthy**
Set `loglevel: debug` and re-run; the action prints the last 50 lines
of the cloudflared log on failure. Most common causes: a revoked token,
an ingress rule that points at a host the runner can't reach, or
account quota.

**`tunnel has active connections` on cleanup**
The post-step retries automatically (12 × 5s, hitting the
`cleanup-connections` API between retries). If you still hit the cap,
open an issue with the run URL.

**My fork's CI does not run the self-test**
GitHub does not pass repository secrets to workflows triggered by
forked pull requests. Maintainers re-run the self-test on the canonical
branch after merging fork contributions.

**Two parallel jobs collide on the same `tunnel-name`**
The action is idempotent on `list → create-if-missing`, so two racing
jobs share one tunnel — and the first post-step to run deletes it out
from under the other. Use `gh-${{ github.run_id }}-${{ github.run_attempt }}`
or `gh-${{ github.repository_id }}-${{ github.run_id }}-${{ matrix.shard }}`.

**Hitting the GitHub releases rate limit when `cloudflared-version: latest`**
The action authenticates the lookup with the runner's `GITHUB_TOKEN` when
it is exported to the step. On a busy self-hosted runner pool sharing
egress IPs, expose the token explicitly:

```yaml
- uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    cloudflared-version: latest
  env:
    GITHUB_TOKEN: ${{ github.token }}
```

The action retries once on a 403/429 before failing.

**Probing `/ready` from a downstream step**
The action publishes `metrics-url` so a follow-up step can
`curl --fail "${{ steps.tunnel.outputs.metrics-url }}/ready"` for
deeper assertions or to wait for additional connections.

## Comparison with peer actions

`cloudflare/wrangler-action` deploys Workers and Pages — it is the right
tool for code deploys, but does not handle tunnels. The closest peer to
this action is `AnimMouse/setup-cloudflared`, which installs and
configures cloudflared but does not run it as a child process or manage
the tunnel lifecycle.

| Capability                          | This action | `AnimMouse/setup-cloudflared` |
|-------------------------------------|-------------|-------------------------------|
| Install cloudflared                 | ✅          | ✅                             |
| Spawn + post-step teardown          | ✅          | external                      |
| Create ephemeral tunnel via API     | ✅          | ❌                             |
| Active-connections retry on cleanup | ✅          | n/a                           |
| Healthy-connection wait             | ✅          | ❌                             |
| SHA-256 binary verification         | ✅          | ✅                             |

### Migrating from `AnimMouse/setup-cloudflared`

If you used `AnimMouse/setup-cloudflared` to install the binary and a
follow-up step to run `cloudflared tunnel run --token …`, replace both
with one step in `connect` mode:

```yaml
# before
- uses: AnimMouse/setup-cloudflared@v1
  with:
    cloudflared-version: 2026.3.0
- run: |
    cloudflared tunnel run --token "${{ secrets.CLOUDFLARE_TUNNEL_TOKEN }}" &
    sleep 5

# after
- uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    mode: connect
    tunnel-token: ${{ secrets.CLOUDFLARE_TUNNEL_TOKEN }}
```

You gain a real healthy-connection wait, automatic SIGTERM teardown on
job exit, and (in `mode=create`) tunnel-lifecycle management.

## Examples

Runnable workflow snippets live in [`examples/`](./examples/):

- [`examples/connect.yml`](./examples/connect.yml) — attach to an
  existing tunnel and run E2E tests against a private origin.
- [`examples/create.yml`](./examples/create.yml) — provision an
  ephemeral tunnel per PR and pass its CNAME to downstream steps.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome.

## Security

See [SECURITY.md](./SECURITY.md). Tokens are masked on read and never
serialized to disk.

## License

[MIT](./LICENSE)
