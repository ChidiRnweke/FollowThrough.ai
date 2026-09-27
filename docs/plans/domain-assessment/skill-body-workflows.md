# Skill draft saves and reviewed body changes

## Editor saves

W12.09 starts in SkillDetailWorkspace. SkillEditor reads the initial Markdown once and exposes the
current Markdown and document. Changes mark the EditorSession dirty and schedule autosave. Ctrl+S
uses the same save path; when the buffer is already clean but synchronization is pending, it retries
those writes. The pane captures both note and metadata drafts before rendering.

A changed description stages a metadata command, then the body stages a note command. These are
separate resource writes with separate ETags. They are not a cross-resource server transaction.
A failed stage keeps the buffer dirty and reports failure. Saved-on-device state is distinct from
synchronized state. Later typing is not overwritten when an earlier save resolves: EditorSession
tracks the editing generation and continues saving the newer buffer. Closing the pane or ending the
account lifetime prevents an old response from adopting content into the active editor.

Resource drafts own outbox identity, current values, retry and conflict handling. Reopening a remote
version is guarded by the editor checkpoint; keeping local content retains later typing. Metadata
conflicts use WorkspaceWriteReview, and note conflicts use the note conflict dialog. Retain these
shared resource decisions instead of putting another queue or version counter in the skill editor.

On the server, synchronized body saves reach Notes.save and the locked shared note edit rule. That
rule owns revision checks and preserves authoritative project, placement, kind and publication facts.
The body, repaired anchors, derived links and indexing consequences share the controller transaction.
Skill import uses Skills.update with its own locked metadata/body transaction and portable validation;
it does not change the ordinary editor's two-resource contract. See [draft save ownership](note-save.md)
and [skill edit locking](skill-edits.md).

## Agent proposals, preview and execution

W12.10 uses edit_skill with exact text replacements. W12.11 uses save_skill with the full Markdown
body. Both are classified mutations, and both prepare a skill-only note change before approval.
Preparation resolves the current note and its revision. Patches require valid matching text and
produce either one complete candidate or a failure; replacement produces a complete candidate from
Markdown. Neither writes at preparation time.

AgentTools stores that prepared result and base under the call identity. The pending approval's
durable review carries the same value. The approval card and full review show the saved comparison
and revision rather than rebuilding it from current browser content. A missing or unreadable legacy
review cannot be approved; rejection remains available, including when one invalid item blocks a
bundle. Failed preparation becomes an explicit tool failure rather than silently terminating the run.

Approved execution uses the saved preparation. Automatic acceptance uses the same preparation and
conditional write. Notes.applyReviewedChange checks that the current target is an active skill,
returns unchanged for an already satisfied result, refuses a different base revision, and saves the
prepared body through Notes.save. A concurrent write that wins after the initial read is caught by
the locked save's revision check. It does not rerun a patch against a new body. The returned projection
identifies the skill; a patch also reports matched text and the applied edit count.

These tools save drafts. They preserve skill metadata, enabled state, title, publication and immutable
history. Repeated delivery of an already satisfied result does not advance the revision. This is
result idempotence, not a claim of exactly-once tool execution. Retain ADR 0003's separation between
review, application, publication and restoration.

## Evidence and test disposition

Retain the real tool-registry skill approval suite for frozen preparation, stale patch/replacement,
repeated delivery, automatic acceptance, invalid targets, missing review and unmatched text. Retain
the actual approval-card/browser tests for saved-review display and disabled legacy/bundle approval.
Keep EditorSession's later-typing, failed-save, replacement and account-lifetime tests, local metadata
command tests, and SQL metadata/body revision and stale-ETag contracts.

Add a PostgreSQL targeted-patch case beside the existing complete replacement case. It prepares and
applies a skill patch twice, then verifies one body revision advance, unchanged metadata and unchanged
published history. Existing database contracts cover stale skill reviews, competing reviewed results,
conditional saves and indexing rollback.

A seeded browser check edited description and instructions through the actual skill page with real
WorkspaceResources while offline. Both changes remained in the local projection with two queued
commands, and export refused while they were unsynchronized. This verifies local retention and the
export guard; it does not claim a live server synchronization or model-driven approval journey.

W12.09, W12.10 and W12.11 are assessed. Restoration policy D03 and the general synchronization family
remain separate. No production behavior or visible UI changes are introduced by this review.
