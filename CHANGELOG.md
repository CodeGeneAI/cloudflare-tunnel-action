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

## [Unreleased]
