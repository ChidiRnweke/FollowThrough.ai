---
title: 'ADR 0042: Rebase local writes with a three-way field merge'
description: Ask the user about a sync conflict only when two edits changed the same field.
---

## Status

Accepted. This decision amends the sections "Durable commands and editor buffers" and "Permanent
server proofs" in ADR 0040. The server version guard does not change.

Amended on 2026-10-25: a draft whose predecessor is neither pending nor the resource's current
receipt is no longer reviewed by default. See "Superseded ancestry".

## Context

ADR 0040 guards each write with the exact server version that the edit observed. Before this
decision, the browser had one answer to a version mismatch: manual review. Two problems made
review appear for edits that did not collide.

First, the caller chose a write's ancestry from the in-memory workspace projection. That projection
is refreshed asynchronously. Each quick action on a todo also opens its own editor. When a second
edit started before the first edit was visible, the second edit was based on the older server
version. Its optimistic value did not include the first edit. After the first edit was applied, the
server rejected the second edit as a conflict. Later edits to the same resource depended on it and
stopped as well.

Second, any change to the server version caused review. This included changes to fields that the
edit did not touch, and revision counters that the server reassigns.

Commands are intents. The server applies an `updateTodo` patch or a note save to its current
version. The version guard exists so that the browser does not overwrite a change that the user
did not see. It does not require the user to confirm changes to fields that the edit leaves alone.

## Decision

### One replay function

Each synchronized value type supplies one pure replay function:
`rebase(observed, local, onto) → { value, overlaps } | null`. For each field that the local edit
changed from `observed`, the result keeps the local value. Every other field takes the value from
`onto`. `overlaps` is true when `onto` also changed that field to a different value. Server
bookkeeping fields (`updatedAt`, `currentRevision` and `completedAt`) are replayed but never count as
an overlap. The replay returns `null` for values that cannot be combined, such as two record types.
The outbox receives the function as a constructor dependency. Workspace records use a field-level
replay. Scalar test values use a whole-value replay.

### The durable queue decides ancestry

The append transaction reads the pending entries and the receipt for the resource. Each draft
carries the value the editor observed when it computed the edit. The queue reads it once, to find
the fields the edit changed, and does not store it. If the draft was made from a version that an
earlier local edit already superseded, the queue stacks the draft on the latest local edit. It
replays the draft's changed fields onto that edit's value. Those earlier edits are this device's own
history, and they come before the new edit. For that reason the local fields always win at append,
and an overlap does not cause review.

When no local edit is pending and the resource's receipt is newer than the draft's base but names
another operation, the receipt came from another surface: another editor, another tab, or a quick
action. The queue replays the draft onto the receipt and queues it when no field collides. A
collision stays for review, because two surfaces changed one field (ADR 0010).

The editor adopts the ancestry and value that the queue stored, not its own copy. A late or
out-of-order projection can no longer give a write a stale base.

### Mergeable conflicts are sent again

When the server answers a write with `conflict` and a found remote version, the queue replays the
write onto that version. If no field overlaps, the queue stores the remote version as the new base,
stores the replayed value, and queues the write again. It replays later local edits of the same
resource onto the result. The settlement, the stored remote record, and the requeued entry commit
in one transaction.

The write keeps its operation identity. A conflict answer stores no proof, cancellation or
receipt, so that attempt is complete. The operation lock and request hash still apply to the next
attempt. A delayed earlier attempt with the old base cannot apply, because its base no longer
matches. After the new attempt is applied, the old attempt fails the request-hash check. Drafts,
receipts and dependents that name the operation remain valid.

Explicit "keep" after review still uses a new identity, as ADR 0040 requires.

### What still needs a decision

Review remains for these cases: a field changed on both sides to different values, a remote
deletion, a conflict on creation, an unavailable remote version, and a missing local ancestry. The
sync indicator and the review list count only conflicts and rejections as decisions. A `retry`
entry resends automatically; it is listed with the waiting writes and shows as saving.

### Superseded ancestry

A draft whose predecessor is neither pending nor the resource's current receipt has lost its exact
ancestry. Before this amendment it always waited for review. Now the queue replays it onto this
device's newer receipt, as described above, and reviews it only when a field collides. The editor
supplies the observed value for that replay. Two cases still need a decision: a predecessor that
another surface discarded, which leaves no newer receipt, and a receipt that records a deletion.

An unavailable remote version is read from the server once the device is online, by review or by
the queue after a proof. The refreshed copy runs the same replay, so a dependent of a proven write
is resent when no field collides. That replay reads the dependent's stored base, which is the
version its proven parent was made from. A field the parent changed and another device changed
again is therefore reviewed, not merged. The result is never lossy.

## Consequences

- Quick successive edits to one resource are sent as one chain against the versions they produce.
- A change on another device to a different field no longer interrupts a local edit.
- A write acknowledged after another surface's write to the same resource no longer interrupts the
  first editor. Only a field changed by both surfaces reaches the user.
- Same-field collisions and deletions still reach the user.
- Every synchronized value type needs a replay function and a list of its bookkeeping fields. A
  field that is added to a record joins the replay automatically.
- A server that answers every attempt with a new conflict causes one resend per new version. Each
  resend needs a real change on the server, so this is bounded by the rate of remote writes.
