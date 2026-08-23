---
title: "ADR 0014: Keep valid notes when other files in an import fail"
description: Report import failures without rolling back useful imported work.
---

# ADR 0014: Keep valid notes when other files in an import fail

## Status

Accepted.

## Context

A Markdown archive can contain hundreds of notes. A few files may be malformed even when the rest
are useful. Rolling back the full import would make users repair every bad file before they can use
any valid result.

A partial import is recoverable when the result says which files failed.

## Decision

We chose to keep each valid note and folder when another file in the same import fails.

The import reports skipped and failed files. It creates note identities before it saves bodies so
links can point to notes that appear later in the archive.

If a note identity is created but its body fails to save, the blank note can remain and the import
reports the failure.

## Consequences

- One malformed file does not discard a large valid import.
- Users can repair reported failures after the import.
- The operation is not one database transaction.
- A failed body save can leave a blank note that the user must repair or remove.
- Repeating an import needs care because earlier results may already exist.

## Evidence

- `src/lib/server/controllers/imports/controller.ts` documents and implements partial import.
- `src/lib/server/controllers/imports/import.spec.ts` checks partly broken archives.
- The controller uses separate passes for identities and note bodies.
