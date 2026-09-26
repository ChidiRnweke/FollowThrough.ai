# Task screenshot disposition

Current review of W09.16 on the open continuation stack. Screenshot completion is a server action;
the later description edit uses the normal durable task command. ADR 0016 keeps file bytes in object
storage and references in authored text. ADR 0041 does not require an offline file-upload path.

## Upload and description ownership

TodoDescriptionField handles pasted or dropped images. It rejects files above its 10 MB screenshot
limit, keeps the current draft while uploading and reports failures. uploadTodoScreenshot computes
the checksum, reserves a project attachment under a task-specific path, sends the bytes to the signed
URL and calls completeTodoScreenshotUpload. Failed object-storage responses become errors; only
successful completion returns the stable application content URL.

The field then inserts escaped Markdown at the caret and commits the description through TodoUpdates.
The attachment link records the task reference; it does not prove that the later description edit
has committed. Retain screenshot-markdown.spec.ts for escaping and caret replacement, screenshot-upload.spec.ts
for upload results/failures, and normal task edit tests for persistence of description intent.

The remote parses upload/task identities and resolves the actor. Attachments.completeForTodo owns
the database transaction. It now resolves the active task through TodoReader before the attachment
service touches storage. Missing, deleted, foreign-account and archived-project tasks are unavailable.
The same task read guards listForTodo. AttachmentLibrary retains checksum/size/expiry validation,
object promotion and resolved version persistence. The attachment record and task link commit together.
The sync ownership trigger already rejects cross-account task/attachment links; this change adds an
earlier task availability check rather than replacing that database invariant.

Three controller regressions failed before the guard: deleted-task completion, missing-task completion
and screenshot listing after deletion. Existing valid completion, listing and database rollback cases
remain. Six PostgreSQL contracts exercise the real task catalog/repository with fake attachment effects:
deleted/archived/foreign tasks cause no completion effects, an active task succeeds, and archived/foreign
listing fails. Those fake effects are outside the database transaction so rollback cannot conceal a
late check. The contracts do not exercise live object storage.

## Explicit remaining attachment work

The task lookup checks availability before completion starts. It does not lock the task across object
storage work or claim serialization with deletion that starts after that lookup. Object promotion and
database commits cannot share a transaction; upload retry and cleanup after a later database failure
remain part of the attachment-family assessment. A completed attachment can also precede a failed or
abandoned description edit. Do not describe their lifecycles as one atomic operation.

No project-equality restriction is added between existing file ownership and task references without
a confirmed product rule. No migration or public command shape changes. This disposition closes the
task workflow ownership review; it does not certify the broader attachment lifecycle or the full
repository assessment. All implementation PRs remain unmerged.

Focused regressions passed six files and 37 tests. The full local unit suite passed 444 files and
4,106 tests. Lint, type checks, architecture audits and documentation checks passed. All required
[CI checks passed](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35923715656), including
the PostgreSQL contracts. The local database environment was unavailable.
