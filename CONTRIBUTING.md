# Contributing

Thanks for considering a contribution! This action is small enough that
most fixes are straightforward.

## Local setup

This repo uses **Bun** for install, test, lint, and typecheck. Bundling
to `dist/` is done by **`@vercel/ncc`** (Bun's bundler inlines build-time
absolute paths into Node-target bundles, which breaks the `verify-dist`
gate).

```bash
bun install
bun run lint
bun run typecheck
bun run test:unit
bun run build
```

`bun run verify-dist` runs the build and fails if `dist/` differs from
what's committed — exactly what the CI gate does.

## Project layout

- `src/main.ts` — main entry; parses inputs and dispatches to a mode.
- `src/post.ts` — post entry; SIGTERMs the connector and (in `create`
  mode) deletes the tunnel via the API.
- `src/modes/runner.ts` — `IModeRunner` registry. Add a new mode here.
- `src/cloudflare/api.ts` — the Cloudflare API client used in `create`
  mode and by the cleanup retry loop.
- `src/cloudflared/{install,run,health,version,platform}.ts` — binary
  download, child-process spawn, healthy-connection wait.
- `src/state.ts` — Per-process JSON state files at
  `$RUNNER_TEMP/cf-tunnel-state-<pid>.json`. The post-step globs them so
  multiple `uses:` of the action in one job each clean up correctly.
  Tokens are never serialized; only the env-var name.

## Tests

Tests are colocated next to source files as `*.unit.spec.ts` and run
under `bun:test`. Always run via `bun run test:unit`, never bare
`bun test`.

When you add a new module, add a `*.unit.spec.ts` for it. The CI
`verify-dist` job will rebuild the bundle, so you don't need to commit
`dist/` changes — but they will be re-bundled by the maintainer before
release.

## Self-test caveat for fork PRs

GitHub does **not** pass repository secrets to workflows triggered by
forked pull requests. The `self-test` workflow gates itself with
`if: github.event.pull_request.head.repo.full_name == github.repository`
and is therefore skipped on fork PRs. Do not propose a switch to
`pull_request_target` — that pattern leaks secrets to attacker-supplied
code.

Maintainers re-run the self-test on the canonical branch after merging.

## `act` (local workflow runs)

[`nektos/act`](https://github.com/nektos/act) can run the `connect` flow
locally if you supply a real `TUNNEL_TOKEN`. `act` does **not** reliably
support `post:` steps as of 2026 — the connector won't be drained and
the tunnel won't be deleted by the post step. Full lifecycle testing
requires a draft PR against the canonical repo.

## Releasing

Releases are driven by [release-please](https://github.com/googleapis/release-please-action).
Land conventional-commit messages (`feat:`, `fix:`, `perf:`, `deps:`,
`docs:`) on `main` and the bot opens a release PR. Merging it cuts
`vX.Y.Z` and the `update-major-tag` workflow advances `v1` and `v1.MINOR`.

While the action is in `v0.x.y`, releases bump the **minor** version on
`feat:` commits (per `bump-minor-pre-major`).

## Code style

- TypeScript strict (`tsconfig.json`), no `any`, no enums (string-literal
  unions instead), no parameter-properties.
- Biome formatting (2-space, 80 col, LF). `bun run format` fixes most
  things.
- New external surfaces (modes, channels, providers) should be added as
  registry entries, not via switch statements that grow over time. See
  `src/modes/runner.ts` for the pattern.

## Reporting security issues

See [SECURITY.md](./SECURITY.md). Do not file public issues for
security reports.
