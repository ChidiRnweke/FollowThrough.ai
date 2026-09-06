---
title: 'ADR 0017: Upload files directly and make them visible only after completion'
description: Avoid proxying large bytes while preventing partial uploads from appearing ready.
---

## Status

Accepted.

## Context

Sending every large file through the application server adds memory, bandwidth, and request-size
pressure. Uploading directly to object storage avoids that cost.

A direct upload has two separate facts: the database reserved a file, and the object store received
its bytes. The system must not present the file as usable when only one fact is true.

## Decision

We chose direct uploads to object storage with a separate completion step.

The application first creates a pending record and gives the client a signed upload URL. The client
uploads the bytes and then reports completion. The file becomes visible only after the application
checks and completes it.

Processing starts from the durable completed state after its transaction commits.

## Consequences

- Large uploads do not pass through the application server.
- An abandoned upload does not appear as a ready file.
- A repeated completion or processing attempt must be safe.
- Database and storage changes can partly succeed and need cleanup.
- A crash between completion and processing must be recoverable from durable state.

## Evidence

- Attachment and template upload controllers expose initiate and complete operations.
- Attachment processing starts after upload completion.
- Upload repositories store pending and completed lifecycle state.
- `docs/architecture/suspicious-findings.md` tracks current crash and cleanup gaps.
