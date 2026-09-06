---
title: 'ADR 0016: Store files in object storage and keep links in authored text'
description: Keep binary data out of notes, tasks, exports, sync messages, and agent context.
---

## Status

Accepted.

## Context

Notes and tasks can use screenshots, documents, and other files. Putting file bytes directly in
their text would repeat large encoded values in lists, exports, sync messages, and agent input.

The application runs in containers with a temporary local file system. The web process and worker
also need access to the same files.

## Decision

We chose an S3-compatible object store for file bytes. Authored text and database records keep
references to those files.

We chose the S3 interface so deployments can select their own compatible storage service.

We will keep this split while files are large shared data that must survive application containers.

## Consequences

- Notes and tasks remain small enough to list, export, sync, and send to an agent.
- Web and worker processes can read the same files.
- Deployments are not tied to one object-storage vendor.
- Database records and file bytes cannot share one transaction.
- File deletion, retry, and cleanup need explicit lifecycle rules.

## Evidence

- Attachment records store object keys instead of file bytes.
- Todo screenshots use stored files rather than inline base64 data.
- Deliverable artifacts and templates use the same S3-compatible boundary.
- Commit `f4488f5` records why todo screenshots moved out of task payloads.
