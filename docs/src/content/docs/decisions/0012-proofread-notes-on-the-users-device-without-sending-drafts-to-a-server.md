---
title: "ADR 0012: Proofread notes on the user's device without sending drafts to a server"
description: Keep proofreading private and responsive while accepting a device-local dictionary.
---

# ADR 0012: Proofread notes on the user's device without sending drafts to a server

## Status

Accepted.

## Context

Proofreading runs while a user types. A server request for each pass would add network delay, cost,
and another place that receives draft text.

The selected checker is a large browser module. Loading it for users who never open a note would
slow unrelated screens.

## Decision

We chose to proofread in a browser worker. Draft text stays on the user's device for this feature.

The checker loads when proofreading is first needed. Editors share one worker. The personal
dictionary is stored on that device.

We will keep this approach while local checking provides the required writing help. A future
synced dictionary would need a separate privacy decision.

## Consequences

- Proofreading does not send draft text to an application or model server.
- Network delay does not affect typing feedback.
- Users who do not proofread do not download the checker.
- The current checker supports English only.
- Learned words survive a browser restart but do not follow the user to another device.

## Evidence

- `src/lib/client/proofreading/harper-linter.ts` runs Harper in a shared browser worker.
- `src/lib/stores/notes/proofreading.svelte.ts` stores settings and words in local storage.
- Proofreading tests check lazy loading and saved dictionary words.
- Commit `80616c5` records the privacy, cost, and latency reasons.
