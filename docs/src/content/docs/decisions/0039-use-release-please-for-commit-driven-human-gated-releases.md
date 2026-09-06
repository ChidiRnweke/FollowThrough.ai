---
title: 'ADR 0039: Use release-please for commit-driven, human-gated releases'
description: Why releases are generated from conventional commits by release-please, gated by a release PR, and fed into the docs from CHANGELOG.md.
---

# ADR 0039: Use release-please for commit-driven, human-gated releases

## Status

Accepted.

## Context

ADR 0038 made every commit and PR title on `master` a conventional commit, enforced
server-side. That decision exists so tooling can trust the history: the next step is a release
process that reads it. Without one, version numbers are chosen by hand, release notes are
written by hand, and the deployments triggered from `v*` tags depend on whoever remembers to tag.

Two consumers want release output:

- **Deployments.** `docker-publish.yml` already builds a versioned image and calls the Komodo
  webhook whenever a `v*` tag is pushed. The release process only needs to produce such tags; it
  must not change the pipeline.
- **The docs.** The Starlight documentation site needs a release-notes page, and the notes must
  come from one source rather than being copied by hand between GitHub Releases and the docs.

The tooling landscape in this space was surveyed:

- **GitHub-native release notes** are PR-plus-label driven, live only in the GitHub Releases UI,
  and cannot version-bump or write a changelog file that a docs site could consume. They also
  have no conventional-commits mode.
- **semantic-release** fully automates versioning and publishes on every merge; it is built
  around package publishing and removes the human decision point entirely.
- **changesets** adds a per-PR changelog artifact and targets multi-package publishing; it is
  ceremony this repository does not need.
- **release-please** (Google) computes the next version from conventional commits since the last
  release tag, maintains a Release PR that bumps `package.json` and appends `CHANGELOG.md`, and —
  when that PR is merged — creates the version tag and a GitHub Release. It does not publish
  packages or touch the deployment pipeline. Its docs recommend exactly the squash-merge flow
  ADR 0038 adopted.

## Decision

We use release-please for versioning and release notes, gated by a human-approved Release PR.

The mechanics, for the record:

- On every push to `master`, the `release-please-action` parses commits since the last release
  tag (`v*`).
- Releasable units are `feat` (minor) and `fix` (patch) commits; `BREAKING CHANGE` (major) is
  reserved for real compatibility breaks under SemVer. `chore`, `ci`, `docs`, `refactor`, and
  `test` commits do not create releases but appear in a release's notes when one happens.
- If releasable commits exist, release-please opens or updates a Release PR titled
  `chore(main): release vX.Y.Z`, bumping `package.json`, appending to `CHANGELOG.md`, and
  updating `docs/package.json` so no workspace package sits on a stale version.
- The Release PR is a normal PR on `master`: the commitlint and PR-title checks from ADR 0038
  apply to it, and it merges only with a squash merge.
- When the Release PR is merged, release-please creates the `v*` tag and a GitHub Release whose
  notes are the changelog entry for that version. `docker-publish.yml` then builds the versioned
  image and triggers Komodo exactly as it does for a manually created tag.
- Cadence is human: the Release PR sits until it is merged. Release happens when someone decides
  it does; the release never happens without the changelog being reviewed.

The first release is bootstrapped as a clean baseline: `v0.1.0` is tagged at the commit that
introduces this process, with a hand-written changelog entry. The 442 commits before that tag
predate ADR 0038 and are not imported into the changelog; the conventional history counts from
the first tag forward.

`CHANGELOG.md` at the repository root is the single source for release notes. The docs build
wraps it into a Starlight "Releases" page, and GitHub Releases display the same text.

## Consequences

- Version numbers and release notes are generated, never hand-typed; `v*` tags appear only when
  the tagged commit really is the release commit.
- Every release passes the ADR 0038 checks and presents a changelog for review before merging.
- The deployment pipeline is untouched: image builds, the `latest` tag on master pushes, and the
  Komodo webhook all behave as before.
- A release costs one PR merge, and only when there is something releasable. There is no release
  noise on `chore`/`docs`/`refactor` commits.
- The docs "Releases" page updates itself whenever a release lands, because the docs deploy
  triggers on `CHANGELOG.md` changes and the page is generated from it at build time.
- Quirks accepted: release-please parses the squashed commit (the PR title, per ADR 0038), so a
  feature merged with a `feat` title is one changelog entry; an incident where the changelog
  entry needs rewording is handled by editing the release notes on GitHub or the changelog in a
  follow-up, not by machinery.
- Version schema: the application is pre-1.0, so releases tread 0.x until a first stable
  milestone; nothing in the pipeline changes when that happens.

## Evidence

- `docker-publish.yml` triggers on `tags: ['v*']` and pushes to `master`, and calls the Komodo
  webhook after build — the release process only needs to supply tags.
- The docs deploy (`docs-pages.yml`) is triggered by pushes touching `docs/**`; after this
  decision it also triggers on `CHANGELOG.md`, and `docs/scripts/generate-changelog.mjs` renders
  the Releases page at build time from the root changelog.
- ADR 0038 established the conventional-commit guarantee this decision relies on; its Evidence
  section documents the server-side enforcement.
- release-please's documentation (googleapis/release-please) recommends squash merges, states
  that it "does not handle publication", and documents the Release PR lifecycle this decision
  uses. The survey of alternatives (GitHub-native notes, semantic-release, changesets) is in the
  Context section.
