---
title: "ADR 0013: Let users name their own task categories"
description: Store task categories as text instead of a fixed product list.
---

# ADR 0013: Let users name their own task categories

## Status

Accepted.

## Context

People group tasks using the language of their work. One user may use clients. Another may use
releases, teams, or work streams. A fixed product list cannot predict this vocabulary.

## Decision

We chose to let users enter category names as text. The product does not define a closed list of
task categories.

Existing category names are offered to help users stay consistent. They do not limit what a user
can enter.

We will keep this design while categories describe user vocabulary rather than product behavior.

## Consequences

- Users can organize tasks with terms that fit their work.
- Adding a category does not need a schema or product change.
- Spelling and capitalization can create similar category names.
- The system cannot attach fixed behavior to every category value.

## Evidence

- The todo schema stores `category` as optional text.
- Todo list filters accept a text category.
- `listCategories` derives the names already in use.
- Commit `9b3dbf8` records that users invent their own categories.
