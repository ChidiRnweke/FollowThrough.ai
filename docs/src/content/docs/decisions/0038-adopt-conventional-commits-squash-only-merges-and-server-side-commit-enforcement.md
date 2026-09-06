---
title: 'ADR 0038: Adopt conventional commits, squash-only merges, and server-side commit enforcement'
description: Why every commit entering master carries a machine-readable type, and why the check lives in CI rather than in local hooks.
---

# ADR 0038: Adopt conventional commits, squash-only merges, and server-side commit enforcement

## Status

Accepted.

## Context

The repository is developed by one maintainer and by agents that commit directly (opencode,
Codex). Until the branch protection described below was enabled, commits reached `master` without
a server-side format check: at the time of writing, 296 of 442 commits (~67%) carry a
conventional `type:` prefix and the rest do not, mixing uppercase verbs (`Fix`, `Land`,
`Record`) and bare sentences. That is fine as history but unusable as input to tooling:
release-note generation, changelog construction, and semver calculation all depend on a commit
message having a parsable type.

Two properties of this repo make the decision concrete:

- **Squash merges make the PR title the commit that lands.** Every pull request collapses into one
  commit on `master` whose message is the PR title (or what the merger types when merging). So the
  enforcement point that determines what actually enters history is the PR title, not the
  intermediate branch commits.
- **ADR 0001 requires important rules to be deterministic checks.** A human-enforced convention is
  not a rule this repository can rely on for tooling input; it must be verified mechanically.

Client-side hooks were considered and rejected. A `pre-commit`/`commit-msg` lint (husky +
commitlint) is bypassable (`git commit --no-verify`), does not run on messages rewritten during an
interactive rebase, cannot vet a squash title that is only composed at merge time on the GitHub
web page, and adds environment-dependent failure modes for the agents that commit here. A required
status check in CI has none of those blind spots: GitHub evaluates required checks both before a
pull request merges and against direct pushes to the protected branch. One server-side workflow
is also the single source of truth; ADR 0001 prefers exactly this shape.

## Decision

We adopt Conventional Commits 1.0.0 for every commit and PR title that enters `master`, and we
enforce it server-side with no local hooks.

- **Format.** `<type>(<scope>): <lowercase subject>`, with types from the Angular set (`feat`,
  `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `style`, `revert`). Scopes are
  free-form and name the area changed (`feat(agent):`, `refactor(chat):`). Breaking changes are
  marked with `!` after the type/scope or with a `BREAKING CHANGE:` footer.
- **Squash-only merging.** Master is protected: every change arrives through a pull request,
  squash-merge is the only merge method, and linear history is required. There are no direct
  pushes. The squash commit's message — the PR title — is the unit of history and the unit of
  change.
- **Enforcement.** Two required status checks on master:
  - `commitlint` runs `@commitlint/config-conventional` (the stock preset, no custom rules) on
    pull-request commits and again on pushes to `master` as a post-merge backstop.
  - `pr-title` validates the pull-request title with `amannn/action-semantic-pull-request`;
    since the title becomes the landed commit under squash, this is the check that matters.
  - The repository's branch protection requires both checks and applies the rules to the
    repository owner as well, so the maintainer is gated like everyone else.
- **No local tooling.** The commitlint CLI is available as a devDependency for voluntary local
  checking, but nothing runs automatically on commit.
- **History is not rewritten.** Existing non-conforming commits stay as they are; the convention
  applies from the current commit forward.

## Consequences

- Every future commit and PR title must conform or the merge is blocked; the failure message from
  commitlint tells the author exactly which rule fired.
- PR titles must be lowercase-started conventional messages. Recent `feat(x): Fix ...` style
  subjects are no longer accepted.
- Direct pushes to `master` are no longer possible, and plain merge
  commits cannot be created; the graph on master stays linear by construction.
- Review fixups inside a PR disappear into the squash commit, so `master` history now admits
  exactly one entry per merged PR.
- A squash merge whose title violates the convention cannot pass the `pr-title` check; the
  push-triggered `commitlint` run remains a backstop for anything that lands through an
  administrative override.
- Tooling that consumes commit history (release notes, changelog generation, semver — the subject
  of a future ADR) can trust the format of every commit.
- An agent that commits non-conforming messages gets a visible CI rejection instead of working
  around a local hook.

## Evidence

- `git log` analysis at the time of writing: 296 of 442 commits already conform to the format; the
  remainder mix uppercase verbs and bare sentences with no type.
- `pnpm exec commitlint --from HEAD~8 --to HEAD` against `commitlint.config.mjs` reproduces the
  intended failures: `feat(cleaner_tool_calls): Fix ...` fails `subject-case` (the preset rejects
  sentence-case subjects), and commits without a type fail `type-empty`.
- GitHub's branch-protection documentation: required status checks must pass before collaborators
  can merge or push changes to a protected branch, and default protection disallows force pushes.
  The same documentation describes "Require a pull request before merging" and "Require linear
  history" as the settings that make this decision hold.
- `wagoid/commitlint-github-action` officially supports both `pull_request` and `push` events and
  reads `commitlint.config.mjs`; `amannn/action-semantic-pull-request` validates conventional
  titles on pull requests.
- ADR 0001 requires deterministic checks for important rules; this decision is enforced by two
  deterministic checks with no false positives by construction (a title or commit either parses as
  conventional or not).
