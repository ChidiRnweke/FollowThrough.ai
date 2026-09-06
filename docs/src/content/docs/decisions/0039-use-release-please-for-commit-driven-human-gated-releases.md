---
title: 'ADR 0039: Use release-please for commit-driven, human-gated releases'
description: Why releases are generated from conventional commits by release-please, gated by a release PR, and fed into the docs from CHANGELOG.md.
---

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
- **Anything that can change what runs is releasable.** `feat` bumps the minor, everything else
  bumps the patch, and `BREAKING CHANGE` (major) is reserved for real compatibility breaks under
  SemVer. Only `docs` and `test` are excluded, because neither can reach the runtime image: the
  documentation site deploys through its own Pages workflow, and specs are not in the bundle.

  The bar is deliberately not "is this a feature or a fix". The image is built only for a
  release, so a type that cuts no release does not ship at all — a `refactor` that redesigned a
  panel sat on `master` unbuilt until an unrelated `feat` happened along and carried it out.
  Shipping is the thing being gated, and a refactor, a dependency bump and a CI fix all change
  what is deployed.

  In release-please the two questions are one dial: a type that is visible in the changelog is
  the same type that triggers a release, so `chore` and `ci` earn changelog lines as the price
  of being able to ship. This changelog is a deployment record rather than a marketing
  document, and that trade is the right way round for it. `release-please-config.json` holds the
  sections; the manifest holds the current version.

- If releasable commits exist, release-please opens or updates a Release PR titled
  `chore(main): release vX.Y.Z`, bumping `package.json` and appending to `CHANGELOG.md`.
- The Release PR is a normal PR on `master`: the commitlint and PR-title checks from ADR 0038
  apply to it, and it merges only with a squash merge.
- When the Release PR is merged, release-please creates the `v*` tag and a GitHub Release whose
  notes are the changelog entry for that version. The same workflow run then **calls**
  `docker-publish.yml` directly, passing the tag it just created; that workflow checks the tag
  out, builds the versioned image and triggers Komodo.

  The call is deliberate and the tag push is not enough. release-please tags with the default
  `GITHUB_TOKEN`, and GitHub does not start a workflow run from an event created with that token,
  so `on: push: tags` never fired for a single release-please tag. It went unnoticed while
  `docker-publish.yml` also triggered on pushes to `master` — that trigger was doing all the
  work — and when it was removed, three releases in a row built no image and deployed nothing.
  Ordering it inside the release run also puts the Komodo webhook where it has to be: a run on
  `master`.

  `workflow_dispatch` on `docker-publish.yml`, taking the same tag, is how a release that already
  exists is deployed, and how a deploy is repeated without cutting a version.

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
- The deployment pipeline does the same work, reached a different way: the image build and the
  Komodo webhook are unchanged, but they are now invoked by the release workflow rather than by a
  tag push, and `:latest` follows the release rather than every push to `master`. Deploying is
  therefore something a release does, and something a `workflow_dispatch` can repeat — never
  something that happens because a branch moved.
- A release costs one PR merge, and nearly every merge to `master` produces something to
  release. That is the intent: the Release PR is how work reaches production, so it should be
  waiting whenever there is work that has not. The cost is a busier changelog, including
  `chore` and `ci` lines that no user cares about; the alternative was changes that silently
  never deployed.
- The docs "Releases" page updates itself whenever a release lands, because the docs deploy
  triggers on `CHANGELOG.md` changes and the page is generated from it at build time.
- Quirks accepted: release-please parses the squashed commit (the PR title, per ADR 0038), so a
  feature merged with a `feat` title is one changelog entry; an incident where the changelog
  entry needs rewording is handled by editing the release notes on GitHub or the changelog in a
  follow-up, not by machinery.
- Version schema: the application is pre-1.0, so releases tread 0.x until a first stable
  milestone; nothing in the pipeline changes when that happens.

## Evidence

- `docker-publish.yml` is a `workflow_call` / `workflow_dispatch` workflow taking the release tag
  as its input, and calls the Komodo webhook after the build. `release-please.yml` calls it when
  its `release_created` output is `true`, passing `tag_name`.
- The run history records the failure this replaced: the last `docker-publish` run before the fix
  was a push to `master` at `2026-09-06T16:40:52Z`, and tags `v0.3.1`, `v0.3.2` and `v0.3.3` —
  all created by release-please — started no run at all.
- The docs deploy (`docs-pages.yml`) is triggered by pushes touching `docs/**`; after this
  decision it also triggers on `CHANGELOG.md`, and `docs/scripts/generate-changelog.mjs` renders
  the Releases page at build time from the root changelog.
- ADR 0038 established the conventional-commit guarantee this decision relies on; its Evidence
  section documents the server-side enforcement.
- release-please's documentation (googleapis/release-please) recommends squash merges, states
  that it "does not handle publication", and documents the Release PR lifecycle this decision
  uses. The survey of alternatives (GitHub-native notes, semantic-release, changesets) is in the
  Context section.
