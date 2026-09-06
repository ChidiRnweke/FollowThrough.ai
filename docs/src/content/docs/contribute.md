---
title: Contributing
description: How changes land on master, the commit convention, and how releases are produced.
---

## How changes land

`master` is protected: every change arrives through a pull request, squash-merge is the only
merge method, and direct pushes are disabled. The squash commit's message — the pull request
title — is the unit of history: one PR becomes one entry on `master`.

Work in a short-lived branch from `master`, open a pull request when it is ready, and squash-merge
it once the required checks pass. There are no local hooks; the checks below are the gate.

## Commit convention

Commits and PR titles follow Conventional Commits:

```
<type>(<scope>): <lowercase subject>
```

- **Types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `style`,
  `revert`.
- **Scopes** are free-form and name the area changed: `feat(agent):`, `refactor(chat):`.
- **Subjects** start lowercase and are not capitalized: `fix: stop the timer double-firing`, not
  `fix: Stop the timer double-firing`.
- **Breaking changes** are marked with `!` after the type/scope or with a `BREAKING CHANGE:`
  footer, and reserve a major version bump.
- **Lowercase**: `feat(workflow): adopt conventional commits`, never `Fix ...` or `Land ...`.

Enforcement is server-side and required on `master`:

- `commitlint` lints the PR's commits, and again against pushes to `master` as a backstop.
- `pr-title` validates the PR title — under squash-merge this is the commit that lands.

A rejection is visible in the PR's checks before merging; reword the offending commit with a
rebase or fix the title. See ADR 0038.

## Releases

Releases are produced by release-please from the conventional history, gated by a release PR:

1. Merging a `feat` or `fix` PR to `master` causes release-please to open or update a
   `chore(main): release vX.Y.Z` pull request bumping the versions and appending to
   `CHANGELOG.md`.
2. Merge that pull request when you decide a release should ship. This creates the `v*` tag and
   a GitHub Release whose notes are the changelog entry.
3. The `v*` tag builds the versioned container image and triggers the deployment webhook; the
   `latest` image keeps tracking every `master` push.

Facts worth knowing:

- `feat` bumps the minor version, `fix` bumps the patch, `BREAKING CHANGE` bumps the major.
  `chore`, `docs`, and `refactor` commits never open a release PR by themselves.
- To force a specific version, put a `Release-As: x.y.z` footer on a commit; release-please
  targets that version in the next release PR.
- The first release, `v0.1.0`, is the clean baseline behind this process as recorded in
  ADR 0039; the changelog only itemizes commits from the first tag forward.
- The docs' Releases page is generated from `CHANGELOG.md` at build time, so it updates
  automatically when a release lands.
