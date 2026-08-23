---
title: "ADR 0009: Archive a project without archiving each item inside it"
description: Hide a project as one unit while keeping its content stored.
---

# ADR 0009: Archive a project without archiving each item inside it

## Status

Accepted.

## Context

A project can contain many notes, tasks, files, memories, diagrams, and documents. Archiving every
item would turn one user action into many lifecycle changes. It would also lose the distinction
between an item the user archived and an item hidden because its project is archived.

The content must remain stored if the project is restored or inspected later.

## Decision

We chose to archive the project record and treat its content as hidden with it. We do not archive
each child record as part of that action.

Normal project lists and project-scoped reads exclude archived projects. The stored child records
keep their own lifecycle state.

We will keep this model while project archive means “hide this body of work,” not “delete its
contents.”

## Consequences

- One archive action hides the project as a unit.
- Child data remains stored with its original state.
- A child does not appear individually archived only because its project is archived.
- Every normal read must respect the active-project boundary.
- A missed project check can expose content from an archived project.

## Evidence

- `src/lib/server/repositories/projects/postgres/projects.ts` archives only the project row.
- Active project reads filter `projects.archivedAt`.
- Child tables retain their project keys and their own lifecycle fields.
- `src/lib/server/controllers/projects/controller.spec.ts` checks active project listing.
