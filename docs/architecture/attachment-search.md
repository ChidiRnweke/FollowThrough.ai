# Complete attachment search

Attachment processing stages every chunk of accepted extracted text. Literal search can read
the new chunks immediately. The embedding worker processes them through the existing 30,000-token
provider batches. It retains old vectors until all replacement vectors are ready (ADR 0020).
The tokenizer is constructed once per embedding operation, rather than once per chunk.

There is no attachment chunk-count cutoff. Storage acceptance and extraction limits still apply;
indexing does not impose a second limit on text already accepted. A complete extraction becomes
`ready` after staging succeeds. An extraction with a reported failure remains `partial`.

## Repairing historical truncated indexes

The old indexer marked complete extractions `partial` when they exceeded fifty chunks, without
a processing failure. The processing worker includes these versions in its durable backlog when
they have both saved text and a parser kind. It claims the version and stages the saved text in
the same transaction as the status change to `ready`. It does not call storage, OCR, or vision.
A failed repair leaves the version eligible for the next sweep. Historical versions do not replace
the current attachment's index. Versions with an extraction failure still use explicit retry.

## Evidence and cost

The regression document has sixty sections and a final unique marker. Tests find that marker
beyond chunk fifty in literal search and in PostgreSQL semantic search after embedding. A second
test crosses the provider batch budget and verifies that every chunk receives a vector.

Indexing the entire file stores and embeds more chunks than the former cutoff. Unchanged hashes
reuse existing vectors. No paid provider was called for these tests, so no monetary cost is
claimed. The local sixty-section test initially took 10.6 seconds while constructing a tokenizer
per chunk; reusing one tokenizer reduced the same two-test run to 0.8 seconds of test execution.
