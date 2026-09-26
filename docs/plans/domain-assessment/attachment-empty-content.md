# Empty attachment extraction

AttachmentProcessing can successfully extract an empty string. For example, a document can contain
no recognized text. That result is distinct from a queued or unsupported version with no extraction.
The worker writes the extracted text and parser kind with ready status. The PostgreSQL view mapper
previously used truthiness and discarded the empty string. AgentVirtualFiles consequently treated the
persisted empty extraction as an absent file, even though processing had completed successfully.

Preserve empty extracted text when the database column is non-null. Keep null as absence. No public
shape, processing rule, database migration or invented fallback is needed. The same repository mapper
serves current attachment views and version reads, so this correction stays at the persistence boundary.

Add three PostgreSQL regressions using the real processing controller and attachment repository with
existing storage/parser/embedding fakes: successful empty extraction survives a read; the agent file
has zero bytes and zero lines; queued content remains absent. These contracts do not make live OCR,
model, embedding or object-storage calls. Retain existing extraction, partial failure, replacement,
claim/recovery and virtual-file tests. No UI rendering changes are made.

This records a concrete gap in W14.05 and W14.09. Those attachment workflows still require their full
ownership dispositions. The attachment namespace's state and optionality review, upload retry/cleanup,
and broader repository assessment remain open. The task family has its own completed assessment
records; open implementation PRs are not merged delivery.

Focused regressions passed 13 files and 77 tests. The full local unit suite passed 444 files and
4,106 tests. Lint, type checks, architecture audits and documentation checks passed. All required
[CI checks passed](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35924353744), including
the three new PostgreSQL regressions. Local PostgreSQL was unavailable.
