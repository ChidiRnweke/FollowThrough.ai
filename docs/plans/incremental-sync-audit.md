# PR #37 audit — issues and reproductions

Hand-off for the agent working on `feat/incremental-sync` (worktree `artifacts/worktrees/incremental-sync`, head `8dd1697`).

The owner's decisions:

- Fix the accepted issues on the PR branch itself. The owner explicitly excluded logout and device removal (issue 10).
- Move sync status out of the full-width bar into a sidebar footer icon.
- Rebuild the review dialog (see UI-1 and UI-2).

Labels: **Confirmed** means the fault was traced in code. **Plausible** means strong code evidence; the repro below should prove or disprove it before you fix.

Test rules from AGENTS.md apply: one `expect` per `it`, `InMemory*` fakes, no `vi.fn`.

---

## 1. A failing write blocks the whole outbox and cannot be discarded — High, Confirmed

**Where:**

- `src/lib/client/sync/mutation-queue.ts` (`submit`)
- `src/lib/models/outbox/index.ts` (`nextWrite`, `discardWrites`)
- `src/lib/components/shared/workspace-write-review.svelte` (`canDiscard`)

**Issue:**

- Any thrown `transport.send` becomes `retry`, and the flush stops.
- `nextWrite` returns the oldest `queued|retry` entry. Every later flush re-sends the same entry first and stops again.
- `discardWrites` throws for `retry` entries, and the dialog disables Discard ("Reconnect to confirm the last send…").
- Anything that throws instead of returning `rejected` triggers this:
  - a 400 from `workspaceMutationRequestSchema` after a deploy
  - the `403` account check
  - a DB constraint error
  - the trigger's ownership `RAISE`
  - a Postgres deadlock
- Result: no later write for the account ever sends, and the user has no escape.

**Reproduction (unit):**

1. Build a `MutationQueue` with the in-memory outbox (`src/lib/testing/sync/fakes/in-memory-outbox.ts`). Use a transport that throws for operation A and applies anything else.
2. Append A (key `["todos","1"]`), then B (key `["todos","2"]`, no dependency).
3. Call `flush()` twice.
4. Expect: B is applied. Actual: B stays `queued`.
5. Call `discard([A])`. Actual: it throws "Check the server receipt before discarding an attempted edit".

**Reproduction (real):**

1. Go offline. Create a note in project P.
2. On another device or with SQL, delete project P.
3. Reconnect. `createNote` fails with an FK or not-found error that is not a `DomainError`, and every later edit stays pending.

**Fix direction:**

- Network failures, 5xx, and deadlocks stay `retry` with backoff.
- 4xx and non-transient errors become `rejected`, which can be discarded.
- Let the queue skip past a failing entry for writes that do not depend on it.
- Allow discarding a `retry` entry after a receipt check.

---

## 2. One unparsable IndexedDB row stops the app from starting — High, Confirmed

**Where:**

- `IndexedDbSyncCache.load` (`src/lib/client/sync/indexeddb-cache.ts`)
- `IndexedDbOutbox.list` / `edit` (`indexeddb-outbox.ts`)
- `readLegacyNoteImports` (`legacy-notes.ts`)

**Issue:**

- Each of these parses the whole row array with `z.array(...).parse`, so one bad row throws.
- The error travels through `resources.initialize()`, then `workspaceSession.start()`, then the `(app)/+layout.ts` load.
- Every app route errors, online and offline, until the user clears site data.
- Common triggers:
  - any future change to `resourceDataSchemas` or `workspaceCommandSchema`
  - one legacy draft that fails the account-key refine
- The legacy DB `followthrough-note-sync` is never deleted, so a bad legacy row fails on every start.

**Reproduction:**

1. In a browser spec (`*.svelte.spec.ts`), open `followthrough-workspace-sync` v5.
2. Put one valid record and one record `{ schemaVersion: 2, accountId, key: '["notes","x"]', entry: { kind: 'present', cache: { kind: 'cached', snapshot: { etag: 'sync-v1-1', value: { type: 'notes', value: { id: 'x' } } } } } }`.
3. Call `createWorkspaceResources(accountId).initialize()`. Expect: it resolves and the valid record loads. Actual: it rejects with a ZodError.
4. Variant: put `{ key: 'acc:note', record: { ...valid, userId: 'other' } }` into `followthrough-note-sync` / `note-sync-records`. Startup rejects.

**Fix direction:**

- Parse row by row.
- Quarantine damaged cache rows and reset the inventory generation. Dropping a row alone does not refetch changes before the saved cursor.
- Move bad outbox rows to a quarantine store and show them in review with Download.
- Retain the legacy database and its version fence. Preserve damaged import markers so recovery cannot duplicate an acknowledged edit.

---

## 3. A second surface writing the same record breaks the open editor — High, Plausible

**Where:**

- `src/lib/stores/workspace/resources.svelte.ts` (`WorkspaceDraft.save`, `uncertainWrite`)
- `MutationQueue.reload` / `acknowledged`
- `retainWriteReceipt` (keeps only the newest receipt per key)

**Issue:**

- An open note editor's draft keeps `current.basedOn = X`, its last operation.
- Another surface writes the same note with its own draft, as operation Y. Examples:
  - global search-replace (`src/lib/stores/search/global-search.svelte.ts`)
  - archive (`project-actions.svelte.ts` `changeTrash`)
  - the shell review dialog's Discard
- Once both are acknowledged, the stored receipt is Y. `uncertainWrite(key, X)` becomes true.
- The editor then shows "The acknowledgement of this edit cannot be verified. Reopen the item…", and `save` throws.
- If the editor had nothing pending, it still sends its stale `base.etag`. Its next autosave then conflicts with the user's own change.

**Reproduction (unit):**

1. Create two `WorkspaceDraft<'notes'>` for the same note on one `WorkspaceResources` with in-memory fakes. Have both `read()`.
2. Draft 1 stages `saveNote`, then flush (applied, etag v2).
3. Draft 2 stages `renameNote`, then flush (applied, etag v3).
4. Draft 1 stages another `saveNote`. Expect `kind: 'saved'`. Actual: `failure` with the acknowledgement message, and `draft1.status === 'error'`.

**Reproduction (real):**

1. Open a note and type, then wait for "Saved".
2. Run global Find & Replace on a word in that note and replace it.
3. Type again in the open editor. The status turns to an error or a conflict.

**Accepted fix:** preserve the editor's base and local document, then stage a normal conflict
when exact predecessor evidence is absent. Do not rebase automatically or require reopening.
Refreshing the server comparison does not accept a version. The user chooses through ADR 0010.

---

## 4. The per-account head lock adds deadlocks — High, Plausible

**Where:** `drizzle/0051_workspace_sync_changes.sql` (`record_workspace_sync_change` updates `workspace_sync_heads`)

**Issue:**

- Every row write on 28 tables updates the account's head row, and holds that lock until commit.
- Two transactions for one account that touch different rows in opposite order now deadlock:
  1. T1 locks row A, then takes the head lock.
  2. T2 locks row B, then waits for the head.
  3. T1 now needs row B.
- Before this change, the same pair would only wait.
- Likely real case: an agent tool transaction and a user save on the same note or todo.
- The deadlock error is not a `DomainError`, so it also feeds issue 1.

**Reproduction (contract, `tests/integration/sync/`):**

1. Seed one user with two todos, A and B.
2. With two connections: T1 `begin; update todos set title='x' where id=A;`
3. T2 `begin; update todos set title='y' where id=B;` (T2 blocks on the head)
4. T1 `update todos set title='z' where id=B;`
5. Expect both to commit after serializing. Actual: `40P01 deadlock detected`.
6. Run the same script on master: no deadlock.

**Fix direction:**

- Take the head lock first in every transaction, via `transactionRunner` or `SyncMutationTransactions.run`.
- Or assign the cursor in a deferred constraint trigger at commit.

---

## 5. Server receipts grow without bound — Medium, Confirmed

**Where:**

- `drizzle/0052_workspace_sync_receipts.sql`
- `src/lib/server/repositories/workspace/sync-receipts.ts` (`save`)

**Issue:**

- Every applied mutation stores the full resource snapshot in `result jsonb`. For a note, that is the whole document.
- This includes every online autosave.
- Nothing deletes rows, and ADR 0040 says nothing about retention.

**Reproduction:**

1. Open a note and type for five minutes online.
2. Run `select count(*), pg_size_pretty(sum(pg_column_size(result))) from workspace_sync_receipts;`
3. Result: one full-document row per autosave.

**Fix direction:**

- Compact the original receipt only after durable client settlement and acknowledgement.
- Retain the operation/request hash/original version proof indefinitely. Never rebuild a receipt from a newer live row. Small proof rows still grow with operation count.

---

## 6. First sync does not scale — Medium, Confirmed in code (size not measured)

**Where:**

- `sync-changes.ts` (`pull`)
- `resource-cache.ts` (`warm` / `drain`)
- `resources.svelte.ts` (`records`, `views`)

**Issue:**

- `pull` returns the whole journal in one `jsonb_agg`, with no page limit. That is one entry per row of every tracked table, including `messages`, `provenance`, `source_anchors`, and `agent_runs`.
- `drain` then downloads each body in its own serial RPC.
- Each download bumps `revision`. `records` rebuilds the full `visibleResources` map on every read, and `views` builds a new `WorkspaceViews` on every read.
- So warm-up costs O(N²) work on the main thread.

**Reproduction:**

1. Seed about 5,000 messages and 2,000 provenance rows for one user.
2. Clear site data and load `/today`.
3. Count `readWorkspaceResource` requests in DevTools. Record main-thread long tasks and the time until the "Downloading workspace…" bar goes away.

**Fix direction:**

- Page `pull` by cursor.
- Batch body reads.
- Memoize `records` per revision.
- Retain all synchronized types. Bound pages and batches using measured evidence, without a total read cap.

---

## 7. The status bar shifts the layout on every online autosave — Medium, Confirmed

**Where:** `src/routes/(app)/+layout.svelte`, the `role="status"` strip

**Issue:**

- The strip renders whenever `pendingChanges > 0`.
- Each queued save mounts a row of about 32px above the tabs and removes it when acknowledged.
- Content jumps while the user types.

**Reproduction:**

1. Open a note online and type.
2. Watch the tab strip: it moves down and back up with each autosave.

**Fix:** UI-1.

---

## 8. One failed body download marks the whole session failed — Medium, Confirmed

**Where:** `ResourceCache.download`, the catch block that sets `this.result`

**Issue:**

- One failed resource read sets the global `result` to failure.
- The shell shows that message and Retry until a later full pull succeeds, even when every other record is fine.

**Reproduction:**

1. Make `readWorkspaceResource` throw for one key. For example, give one row a value that fails `workspaceObjectReadSchema`.
2. Load the app. The bar shows that error permanently.

**Fix direction:** keep the failure on the entry only, and report a count of failed resources.

---

## 9. Unknown command kinds fall through to the notes controller — Medium, Confirmed

**Where:** `src/lib/remote/workspace/mutations.remote.ts`, `default:` branch

**Review:** the original default relied on the notes controller's narrow parameter type, so TypeScript already rejected many omissions. Explicit note cases and an exhaustive `never` check make that contract visible; this is defensive cleanup, not evidence that arbitrary commands reached notes at runtime.

**Fix:** list the notes kinds explicitly and add `command satisfies never` in `default`.

---

## 10. Sign-out and device removal — excluded by the owner

No logout flow or device-removal behavior is introduced by this task. The existing account binding
continues to separate cached data, and unsent edits remain available to the same account.

---

## 11. AGENTS.md curl check is obsolete — Low, Confirmed

**Issue:**

- `(app)/+layout.ts` now sets `ssr = false`, and every `+page.server.ts` was deleted.
- The documented "curl with a minted session to check server-rendered output" now returns an empty SPA shell.

**Fix:** update AGENTS.md "Seeing the running app", and the related memory note.

---

## 12. Dev databases managed by `db:push` break — Low, Confirmed

**Issue:**

- `drizzle-kit push` does not create the functions and triggers in `0050–0052`.
- Without version rows, `WorkspaceSyncObjects.read` produces `etag: null`, `workspaceObjectReadSchema` rejects it, and every read throws.
- The local dev DB is push-managed today.

**Reproduction:** point the app at a DB created with `pnpm db:push` and open `/today`.

**Fix:** document the migration step or add a setup script.

---

## 13. The account cookie is set on every request — Low, Confirmed

**Where:** `src/hooks.server.ts` (`setWorkspaceAccountCookie`)

**Issue:** every response, remote-function calls included, carries `Set-Cookie: workspace_account=…`.

**Fix:** set the cookie when the account changes or rolling renewal is due. A matching cookie still needs renewal before its lifetime expires.

---

## UI-1. Replace the full-width status bar with a sidebar footer indicator

**Current:**

- A text strip above the tabs reads, for example, "Offline · using saved content · 1 pending · Review changes".
- It has no icon and no hierarchy, and it causes issue 7.

**Target:**

- New `src/lib/components/shell/sync/sync-status-menu.svelte`, modelled on `memory/memory-notification-menu.svelte` (icon button + `Badge` + dropdown).
- Placement:
  - the icon row in `navigation/app-sidebar.svelte`, next to the memory bell
  - the mobile header in `(app)/+layout.svelte`
- Derive its state from a pure, unit-tested `syncIndicator(...)` in `models/sync`:
  - **synced:** cloud-check icon, no badge
  - **saving:** a subtle pulse, no layout change
  - **offline:** cloud-off icon, with a pending-count badge when writes are waiting
  - **downloading:** progress shown in the popover
  - **attention:** destructive color, badge counting the changes that need review
- Popover:
  - a headline, e.g. "You're offline" or "2 changes need review"
  - one supporting sentence
  - at most two actions: "Review changes" and "Retry now"
- Delete the strip.

## UI-2. Rebuild the review dialog around decisions

**Current (screenshot `docs/pr-evidence/incremental-sync/review-offline-project.png`):**

- Every element has the same weight: a ghost "Back to changes", the title, and a raw command label "Create Project".
- A "Shared base" column contains only "No item".
- Fields are dumped raw, including internal ones like `Role: workspace`.
- Nothing says what state the change is in or what to do next.
- Close, Download, and Discard all look equally important.

**Target (`workspace-write-review.svelte`, `workspace-record-preview.svelte`):**

- **List view:**
  - Group rows as "Needs your decision", then "Waiting to send", then "Sending", each with a section label and count.
  - Each row: type icon, title, then a human action line (e.g. "New project · created offline").
  - The whole row is clickable.
  - When nothing is pending, show `empty-state.svelte` with "Everything is saved".
- **Detail view:**
  - A breadcrumb back link ("Changes / {title}"), then the title.
  - One `Alert` saying what happened and what to do:
    - queued offline: info
    - conflict: warning
    - rejected: destructive, showing the server message
  - Map each command kind to a verb phrase (e.g. `createProject` → "Created project").
  - Render only the columns that carry information. A creation shows one "Your change" card. A conflict shows "Your version" and "Current on server", with "Original" behind a disclosure.
  - Show per-type fields a user would recognize. Hide ids, roles, and timestamps. Highlight changed fields with the brand wash.
  - Notes and diagrams reuse the `NoteVersionDiff` and diagram conflict layouts.
  - Dependent changes sit in a collapsible "Also affected (n)" section.
- **Footer:**
  - "Download a copy" as a quiet link on the left.
  - The primary decision on the right: "Keep my version" or "Send now".
  - "Discard change" as an outline destructive button.
  - Close stays only as the X in the header.
  - Every disabled button gets a tooltip explaining why.
- Add a design-system rule: sync status lives in the shell's utility icons, never in a banner, and review leads with the decision.

**Evidence:** capture before/after screenshots at 1280×720 and about 400px wide, in light and dark. Cover:

- the indicator: synced, offline with pending changes, attention
- the dialog: list view, creation detail, conflict detail

Commit them under `docs/pr-evidence/incremental-sync/` and follow the `drafting-prs` skill.
