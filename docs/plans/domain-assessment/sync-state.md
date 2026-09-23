# Workspace synchronization state

## Protocol owner

The shared synchronization state service owns pending-write transitions, exact receipt ancestry,
monotonic cache merging and the projection of local intent over server records. These decisions use
the same version order and evidence. They have one implementation, with no storage or transport I/O.
The status indicator has a separate shared presentation service.

IndexedDbOutbox and IndexedDbCache still execute transitions inside their existing Dexie transactions.
MutationQueue retains account locking, submission and recovery coordination. WorkspaceResources
retains editor admission and observation. Their calls now name the rule owner instead of importing
behavior from models. The in-memory repositories use the same rules and retain their storage contracts.
This changes no store, schema, transfer group, command, receipt or wire format.

Models retain values, Zod schemas and the positive bigint-based version constructor. The 128-record
transfer group keeps its existing benchmark citation. Unavailable state is not treated as an empty
successful read: uncached failures remain explicit and missing ancestry still requires review.

## Retained guarantees

- Cache pages, targeted reads and receipts retain monotonically ordered versions. Equal-version
  deletion wins; later recreation remains possible. Comparisons retain bigint precision.
- Only an exact predecessor receipt supplies a descendant's new base. Ordinary refreshes cannot
  replace that proof. Delayed descendants with missing evidence retain their content for review.
- Attempted identity and input remain immutable. Only eligible unsent edits coalesce. Failed edits
  block dependents while independent writes can proceed.
- Keep-conflict uses a new identity; discard refuses unknown submission outcomes and unreviewed
  descendants. Cached and optimistic records remain visible under the existing offline rules.

Remove the unused rejectUnprovenAncestry export. Source search found no caller or test. It belonged
to the retired granular repair protocol; ADR 0040 now requires malformed storage to block the account
and leave raw rows untouched. Do not introduce a replacement or compatibility wrapper.

## Test dispositions and scope

Move queue, receipt, conflict, visibility, cache and indicator behavior tests beside the services,
preserving their assertions. Keep the persisted-body schema rejection in models; move its five
version-ordering neighbors to the state service. Retain IndexedDB contracts, account/race tests,
mounted conflict-review tests and PostgreSQL/PWA scenarios at their actual boundaries.

The focused local run passes 14 files and 113 tests. Broader observed validation is recorded in the
PR. This disposition establishes state-rule ownership. It does not by itself close the complete
replication, startup, account-lifetime and offline recovery workflow assessment.
