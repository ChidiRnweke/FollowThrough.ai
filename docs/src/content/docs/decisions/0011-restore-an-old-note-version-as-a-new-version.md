---
title: "ADR 0011: Restore an old note version as a new version"
description: Keep note history intact so a restore can also be undone.
---

# ADR 0011: Restore an old note version as a new version

## Status

Accepted.

## Context

A user may need to return to an earlier published note. Replacing the current version number with
an old one would rewrite history. It would also make the restore hard to undo.

Saving every keystroke as a permanent version would make history large and noisy.

## Decision

We chose to keep published note versions as an ordered history. Restoring an old version copies its
content forward into a new version. It does not remove or rewrite later history.

We take durable snapshots when a note is published, not on every edit. We keep a bounded number of
recent snapshots. The exact limit is a tuning value.

## Consequences

- A restore is visible in history and can itself be undone.
- Earlier versions remain unchanged.
- Draft edits between publishes are not separate restore points.
- Snapshot retention limits storage but can remove very old versions.
- Restoring a note also needs to restore the files that belonged to that version.

## Evidence

- `src/lib/server/controllers/notes/restore-revision.spec.ts` checks copy-forward restore.
- `src/lib/server/controllers/notes/revision-history.spec.ts` checks publish snapshots and retention.
- Note restore reindexes content and restores the attachment snapshot.
- Commit `1cfe1b7` introduced the visible history and restore flow.
