# Changelog

This changelog is maintained by [release-please][rp]. Each merged PR with
a conventional-commit message becomes a release-notes entry on the next
release.

The first release will be cut as `v1.0.0` from the bootstrap commit's
`Release-As: 1.0.0` footer; subsequent releases follow standard semver
(`feat:` → minor, `fix:`/`perf:` → patch, `feat!:` or `BREAKING CHANGE`
footer → major). The `update-major-tag.yml` workflow also moves the
floating `v1` and `v1.MINOR` tags on every release.

[rp]: https://github.com/googleapis/release-please-action

## 1.0.0 (2026-05-01)


### ⚠ BREAKING CHANGES

* macOS runners now error at parse time. They were documented as supported pre-1.0 but never actually shipped to a released tag, so no consumer is affected by the change.

### Features

* address round-1 review (P0/P1 bugs, tests, hardening, polish) ([cea8272](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/cea827277e100e412e5bbc20e004d2ab99a48d96))
* address round-2 review (orphan-pid window, IPv6 reachability, dispatch, deps, timeouts, polish) ([78006bf](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/78006bf1d9cc19444e0055c980a6cdeb3664179b))
* address round-3 review (orphan-on-metrics, per-pid state, retry budget, predicate, tool-cache reverify, polish) ([7930719](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/7930719d9272a4530abc3fbf1f1306db93cb8b65))
* drop macOS support for v1; document self-test secrets ([#3](https://github.com/CodeGeneAI/cloudflare-tunnel-action/issues/3)) ([a94b448](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/a94b44829844a9f1171e4ba7db00aa57da554d53))
* initial scaffold for cloudflare-tunnel-action ([e09ab86](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/e09ab86834aed56b3a3f93e6f9f20b18f48d2b86))


### Bug Fixes

* **build:** swap bundler from bun build to @vercel/ncc ([c9484e3](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/c9484e3492f287f2ca7ef40345202a152e1ab198))
* drop --minify so dist build is deterministic ([9e3d347](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/9e3d347ef52c859177ffb2075f39781356bd17e2))
* **install:** cloudflared upstream doesn't publish .sha256 sidecars ([#4](https://github.com/CodeGeneAI/cloudflare-tunnel-action/issues/4)) ([c396313](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/c396313d112cc565a10eb0fe043a49993a4c8a79))
* round-5 polish (self-test env hoisting, decideCacheUse wiring, doc lockstep) ([f05e4c0](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/f05e4c03a92f8949bfcae70f0aa26f288e87696b))
* round-6 polish (release-please bootstrap, base64url decode, UA test) ([c10c8d3](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/c10c8d3e89d5e5d94f7934c20aa9a9dd238bde48))


### Documentation

* **connect:** clarify base64url translation is defensive on Node ([7767670](https://github.com/CodeGeneAI/cloudflare-tunnel-action/commit/7767670073857b4ca73ef9b4da406f5a8a859a72))

## [Unreleased]
