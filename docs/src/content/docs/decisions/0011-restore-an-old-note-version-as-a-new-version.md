---
title: 'ADR 0011: Restore an old version as a new version'
description: Keep note and diagram history intact so a restore can also be undone.
---

## Status

Accepted. Extended to diagrams.

## Context

A user may need to return to an earlier published note. Replacing the current version number with
an old one would rewrite history. It would also make the restore hard to undo.

Saving every keystroke as a permanent version would make history large and noisy.

Diagrams need the same thing for a sharper reason. The agent writes diagram revisions during a
conversation, so a user can arrive at a version they did not author and did not ask for. Being able
to see the history and step back is what makes that safe to allow at all.

## Decision

We chose to keep published versions as an ordered history, for notes and for draw.io diagrams.
Restoring an old version copies its content forward into a new version. It does not remove or
rewrite later history.

We take durable snapshots when a document is published, not on every edit. We keep a bounded number
of recent snapshots. The exact limit is a tuning value.

A document therefore carries two version numbers: the working revision it is currently at, and the
revision that is published. A save moves the first. Publishing moves the second. This is what lets
a change be written and looked at without yet being the version anyone else sees.

## Consequences

- A restore is visible in history and can itself be undone.
- Earlier versions remain unchanged.
- Draft edits between publishes are not separate restore points.
- Snapshot retention limits storage but can remove very old versions.
- Restoring a note also needs to restore the files that belonged to that version.
- An agent's diagram revision can be read, published, or stepped back from, using the same history
  a user's own edit produces. It is not a special kind of change.

## Evidence

- `src/lib/server/controllers/notes/restore-revision.spec.ts` checks copy-forward restore.
- `src/lib/server/controllers/notes/revision-history.spec.ts` checks publish snapshots and retention.
- Note restore reindexes content and restores the attachment snapshot.
- Commit `1cfe1b7` introduced the visible history and restore flow.
- `Note` and `DrawioDiagram` both carry `currentRevision`, `publishedRevision`, and `publishedAt`.
- `src/lib/server/controllers/diagram-studio/controller.ts` implements `listDiagramRevisions`,
  `getDiagramRevision`, and `restoreDiagramRevision` for diagrams.
