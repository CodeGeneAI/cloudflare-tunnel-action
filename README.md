# Cloudflare Tunnel Action

Run a [cloudflared](https://github.com/cloudflare/cloudflared) connector on a
GitHub Actions runner so the job can reach private origins via a Cloudflare
Tunnel. Supports two modes:

- **`connect`** — attach a connector to an existing tunnel using a connector
  token.
- **`create`** — create an ephemeral named tunnel via the Cloudflare API,
  connect to it, and (by default) delete it on job exit.

## Quick start

### Connect to an existing tunnel

```yaml
- uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    mode: connect
    tunnel-token: ${{ secrets.CLOUDFLARE_TUNNEL_TOKEN }}

- run: curl --fail https://internal.example.com/health
```

### Create an ephemeral tunnel

```yaml
- id: tunnel
  uses: CodeGeneAI/cloudflare-tunnel-action@v1
  with:
    mode: create
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    tunnel-name: gh-${{ github.run_id }}-${{ github.run_attempt }}

- run: echo "Tunnel CNAME ${{ steps.tunnel.outputs.tunnel-cname }}"
```

## Inputs

| Input                  | Default       | Description |
| ---------------------- | ------------- | ----------- |
| `mode`                 | `connect`     | `connect` or `create`. |
| `tunnel-token`         | —             | Connector token. Required when `mode=connect`. |
| `api-token`            | —             | Cloudflare API token. Required when `mode=create`. Scope: **Account → Cloudflare Tunnel → Edit**. |
| `account-id`           | —             | Cloudflare account ID. Required when `mode=create`. |
| `tunnel-name`          | —             | Tunnel name. Required when `mode=create`. |
| `cleanup-on-exit`      | `true`        | When `mode=create`, delete the tunnel in the post-step. |
| `cloudflared-version`  | `latest`      | cloudflared release tag (e.g. `2026.3.0`) or `latest`. |
| `loglevel`             | `info`        | cloudflared `--loglevel`. |
| `metrics`              | `localhost:0` | Bind for cloudflared `--metrics`. `:0` picks a free port. |
| `wait-for-connections` | `true`        | Block until at least one healthy edge connection. |
| `wait-timeout-seconds` | `60`          | Max seconds to wait for a healthy connection. |

## Outputs

| Output         | Description |
| -------------- | ----------- |
| `tunnel-id`    | Tunnel UUID. Always set in `create`; best-effort decode in `connect`. |
| `tunnel-cname` | `{tunnel-id}.cfargotunnel.com`. |
| `tunnel-token` | Masked connector token. Set in `create`; echoes input in `connect`. |
| `metrics-url`  | Resolved cloudflared metrics URL. |

## Required Cloudflare API token scopes (`mode=create`)

Create an API token at <https://dash.cloudflare.com/profile/api-tokens> with:

- **Account → Cloudflare Tunnel → Edit**

That single permission covers list, create, delete, get-token, and
cleanup-connections.

## Architecture

1. The action downloads `cloudflared` from the upstream GitHub releases
   (SHA-256 verified, cached per version+arch via `@actions/tool-cache`).
2. It spawns `cloudflared tunnel --no-autoupdate run --token <…>` as a
   detached child and captures stdout/stderr to `$RUNNER_TEMP/cloudflared.log`.
3. When `wait-for-connections=true`, it polls the connector's `/ready`
   metrics endpoint until at least one edge connection is registered.
4. The post-step sends `SIGTERM`, drains for up to 30s, then `SIGKILL`. In
   `create` mode it also deletes the tunnel via the API, retrying up to 12×5s
   if connectors are still draining.

## Supported platforms

- `ubuntu-latest`, `ubuntu-24.04-arm` (Linux x64 / arm64)
- `macos-latest`, `macos-13` (macOS x64 / arm64)
- **Windows is not supported in v1.** Planned for v1.1.

## FAQ

**"tunnel has active connections" on cleanup**
The post-step retries automatically (12 attempts × 5s, with the cleanup-
connections endpoint between retries). If you still see this, open an issue.

**Connector never becomes healthy**
Set `loglevel: debug` and inspect the captured log printed at the end of the
job. The most common cause is a revoked token or an ingress route that points
at a host the runner cannot reach.

**My fork's CI does not run the self-test**
GitHub does not pass repository secrets to workflows triggered by forked
pull requests. Maintainers re-run the self-test on the canonical branch
after merging fork contributions.

**Two parallel jobs reusing the same `tunnel-name`**
The action is idempotent on `list → create-if-missing`, so two racing jobs
will share one tunnel — and the first post-step to run will delete it out
from under the other. Use a per-run name like
`gh-${{ github.run_id }}-${{ github.run_attempt }}`.

## Security

See [SECURITY.md](./SECURITY.md). Secrets are masked via `core.setSecret()`
on parse; no token value is ever written to the on-disk state file.

## License

[MIT](./LICENSE)
