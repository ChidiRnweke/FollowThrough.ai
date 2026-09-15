# Domain composition implementation checklist

## Remaining work

- [x] Generic aggregate participants: PR #44 merged; required CI checks passed.
- [x] Shared placement, lifecycle and task decisions and incomplete-inventory checks: PR #47; required CI checks passed.
- [x] Shared skill document writes and import drafts: PR #48; required CI checks passed.
- [x] Resolve selection origins once: PR #50 merged; required CI checks passed.
- [x] Persist proposal changes and check them before undo: PR #54 merged; required CI checks passed.
- [x] Share agent/workflow settlement and browser event consumption: PR #60 merged; required CI checks passed.
- [ ] Share indexing plans; recover queued attachment work with PostgreSQL advisory claims.
- [ ] Share export preparation and replace the named-entity decoder with `entities`.

Each item needs its own PR with the deleted implementations and observed verification results.
Before marking a stage complete, run its focused tests and the lint, type, architecture, unit,
PostgreSQL contract and docs checks. Command, storage and editor changes also require the production
sync/PWA suite. Capture matched screenshots for skill-history changes. Proposal undo retains the existing agent command; it adds no UI.

Required behavior checks:

- Browser and server callers produce equivalent decisions from equivalent facts.
- Partial inventory cannot prove a missing parent or empty folder.
- Domain writes and sync proofs commit or roll back together.
- Skill metadata-only edits leave history untouched; concurrent document edits conflict.
- Imports stay drafts; publication creates snapshots; restoration preserves attachments and links.
- Proposal undo reverses all recorded effects atomically and refuses stale effects or missing application records.
- Cancellation and settlement races produce one terminal outcome and its required events.
- Restarted attachment workers resume queued work; competing workers cannot publish conflicting results.
- Shared projections and exports preserve displayed records, content and asset availability.

Only the current record and event formats are supported. Remove obsolete compatibility paths when their producers are gone.
