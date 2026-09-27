# Attachment visibility after project archival

This is a partial assessment of W14.01, W14.02, W14.08–W14.11 and background processing under
ADR 0009. Normal reads must exclude archived projects. Attachment ownership checks previously
accepted an owned file without checking its project. The authenticated content endpoint could
therefore mint a new object-storage download URL after project archival. Note and project lists,
note-relative reads and background processing discovery also exposed those files.

AttachmentRecords now requires an active project for normal reads, upload reservation lookup and
creation, processing discovery and version selection. The service checks the upload reservation
before object inspection or promotion, so a project already archived when completion starts is
rejected before those effects. Note-relative download and extracted-content reads share the same
filtered lookup. Identity downloads, retry and normal deletion use the filtered identity lookup.
Task lists retain their controller-level task ownership checks and also filter attachment projects.

Expired upload discovery and reservation deletion deliberately remain available for archived
projects. Retention must still reclaim abandoned staged bytes. This change does not delete stored
attachment history or define a new rule for attachments of individually archived notes.

A local reproduction used the migrated PGlite database and real repositories. After archival, the
old queries returned one listed attachment, an available identity download record and one queued
version. The corrected queries returned zero, absent and zero. Twelve PostgreSQL contract tests
cover note/project/task reads, identity downloads, path lookup, new reservation rejection,
completion rejection, background discovery and selected-version rejection, active access and
retention access. Their execution status is recorded in the PR.

Remaining work includes concurrent project archival versus upload promotion/finalization, storage
failure compensation, duplicate completion, parser outcomes and existing signed URLs until their
expiry. The local reproduction does not establish PostgreSQL lock behavior or live S3 behavior.
No broad workflow is marked complete from these boundary checks alone.
