# Template upload readiness

A template upload reservation and a usable document template are separate records.
`template_uploads` stores the declared file size and SHA-256 checksum. `ProjectTemplate` requires
extracted styles; its list contains only completed templates. An explicitly selected missing or
unfinished template fails document generation instead of silently using default styles.

## Completion

The deliverables controller reads the staged object, verifies its actual size and checksum, and
extracts DOCX styles. It then writes those exact verified bytes to the final key. It does not copy
the staging key after verification: the signed upload URL may still permit that key to change.

The controller locks the reservation in a database transaction, inserts the usable template, and
removes the reservation. Concurrent deliveries return the same completed template. It removes the
staged object after commit. Object storage does not participate in the database transaction.

- A verification or extraction failure leaves the reservation and staged object available for retry.
- A database failure after the final object write leaves the reservation available. Retry overwrites
  the same final key with verified bytes and completes the transaction.
- A cleanup failure is reported even though the usable template is already durable. Repeating
  completion finds the template and retries staging cleanup.
- Another account cannot reserve an upload in the project or complete its reservation.

## Existing rows

Migration 0056 adds reservations and limits template-name uniqueness to completed rows. It preserves
old incomplete rows and artifact references. These rows are not returned by template reads or lists,
and they do not prevent a new upload with the same name. Their original expected checksum was never
stored, so completion asks the caller to upload the file again. It cannot claim verification by
inventing the missing checksum from the object that is being verified.

The current frontend has no template picker. The list is exposed through the agent's `list_templates`
tool; upload completion is available through the remote command. This change adds no frontend surface.

## Validation

Controller tests use real DOCX bytes and the real style extractor. They cover unfinished listings,
size and checksum mismatches, repeated completion, extraction failure, and retries after database
and cleanup failures. PostgreSQL contracts cover concurrent completion, account ownership, legacy
rows, and re-upload under an old unfinished name. Storage remains a stateful in-memory fake; these
tests do not make a live object-store request.
