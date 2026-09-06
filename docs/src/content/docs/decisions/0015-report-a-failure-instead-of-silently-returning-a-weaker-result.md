---
title: 'ADR 0015: Report a failure instead of silently returning a weaker result'
description: Tell users when requested work failed or returned an incomplete result.
---

## Status

Accepted.

## Context

A failed dependency can tempt the application to return an older, simpler, or incomplete result.
That keeps a screen moving, but it hides whether the requested work happened with the promised
quality.

Users cannot correct or retry a failure they cannot see.

## Decision

We chose to report a failure instead of silently switching to weaker behavior.

An operation may return a partial result only when it clearly states what is missing. An explicit
user or operator mode may choose a different implementation because that choice is not hidden.

We will keep this rule for requested product outcomes. Secondary bookkeeping may have a different
failure contract, but its loss must still be visible to an operator when it matters.

## Consequences

- Users can tell whether the requested work completed.
- Recovery and retry remain possible.
- Missing configuration does not quietly change product quality.
- Some failures interrupt work that a fallback could have partly completed.
- Each partial-result feature needs a clear user message.

## Evidence

- Knowledge search and reranking throw when their required result cannot be produced.
- Mistral OCR fails instead of switching to a weaker parser.
- `docs/architecture/suspicious-findings.md` tracks current silent fallbacks in model listing,
  exports, feedback, token bookkeeping, promise extraction, and relationship classification.
