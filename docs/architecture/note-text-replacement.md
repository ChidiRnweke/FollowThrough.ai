# Note text replacement outcomes

Search and document replacement use one shared service in `services/notes/text-search.ts`.
Models contain the search and replacement value types. The shared service retains the existing
literal, regex, formatting-boundary, and paragraph behavior.
Search now reports every match instead of stopping at 100 per note while replacement changes all
of them. This keeps the confirmation count consistent with the body edits.

## Server batches

`Notes.replaceText` owns one transaction across all selected note writes and their consequences.
Its API returns aggregate success counts, so a failed batch must not leave earlier notes changed.
Each write still uses the ordinary note save and revision guard. PostgreSQL tests fail after indexing
the second note and verify both original bodies and indexes. Retrying after recovery increments each
note once.

## Browser batches

The browser uses the existing durable per-note queue. The store snapshots Svelte's reactive values
before handing them to shared code; `structuredClone` cannot clone a Svelte proxy. The shared
replacement controller captures every selected base before the first write and coordinates each
queue operation.

A failed local write returns the confirmed saved note identities and match counts, the failed note
and reason, and the identities not yet attempted. The UI reports the saved notes and remaining work.
A local save means saved on this device; it does not claim server acknowledgement. A failed write
is reported as unconfirmed because a storage error can leave its final state uncertain. Server
delivery and conflict review retain their existing per-note behavior.

## Evidence

The browser fixture contains three notes with `ship release`, replaces `ship` with `deploy`, and
fails the durable append for Note 2. It uses the actual workspace cache, draft, queue, search store,
and search panel with in-memory storage. The base store fails on the reactive clone before writing.
The revised store queues Note 1, reports Note 2's failure, and leaves Note 3 unattempted. The same
fixture without the storage failure queues all three replacements.

Before/after captures show those actual outcomes at 900 × 750 in light mode. Only dependency
injection and relocated imports were adapted when executing the base store; its replacement logic
was unchanged. These are component and browser workflow checks, not an authenticated end-to-end
server synchronization scenario.
