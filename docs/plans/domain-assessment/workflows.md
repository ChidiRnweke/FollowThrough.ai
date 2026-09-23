# Workflow assessment ledger

This is the workflow inventory agreed for the repository-wide assessment. IDs are stable;
append new IDs instead of renumbering them. A checkbox means the **assessment** is complete,
not that implementation has shipped. No unchecked item may be called fully reviewed merely
because its containing folder was read. Family assessments and source inventory are linked
from [the execution plan](../domain-assessment-plan.md).

## 01 — Account access and identity

- [ ] W01.01 Enter the public landing page or authenticated workspace.
- [ ] W01.02 Begin sign-in and validate the authentication callback.
- [ ] W01.03 Create an account or link an existing provider identity.
- [ ] W01.04 Route waiting and admitted users.
- [ ] W01.05 Create, validate, renew, and expire sessions.
- [ ] W01.06 Sign out and detach account-specific browser state.
- [ ] W01.07 Authenticate API-token requests.
- [ ] W01.08 Create, list, and revoke API tokens.
- [ ] W01.09 Enforce ownership across reads, writes, downloads, streams, and tools.
- [ ] W01.10 Initialize the application with authentication disabled.

## 02 — Workspace initialization and preferences

- [ ] W02.01 Bootstrap identity, preferences, and available resources.
- [ ] W02.02 Provision the inbox project and built-in skills.
- [ ] W02.03 Read and update account preferences.
- [ ] W02.04 Restore account-specific local workspace data.
- [ ] W02.05 Switch between online and offline workspace access.
- [ ] W02.06 Open unavailable, missing, archived, or deleted resources.
- [ ] W02.07 Assemble workspace context for navigation and agent requests.
- [ ] W02.08 Assemble today's work using the user's local date.

## 03 — Projects and folders

- [ ] W03.01 Create, list, and open projects.
- [ ] W03.02 Rename projects.
- [ ] W03.03 Archive projects and resolve child visibility.
- [ ] W03.04 Create folders.
- [ ] W03.05 Browse and expand project trees.
- [ ] W03.06 Move notes and folders between parent locations.
- [ ] W03.07 Reorder project entries.
- [ ] W03.08 Drag project entries into navigation and editing surfaces.
- [ ] W03.09 Configure project section-numbering defaults.
- [ ] W03.10 Resolve the project for new resources.

## 04 — Note lifecycle

- [ ] W04.01 Create a note in a chosen project or folder.
- [ ] W04.02 Capture a note through quick capture.
- [ ] W04.03 List and open notes.
- [ ] W04.04 Rename notes through the editor, tree, and agent.
- [ ] W04.05 Edit and autosave drafts.
- [ ] W04.06 Publish notes.
- [ ] W04.07 Discard unpublished changes.
- [ ] W04.08 Browse revision history.
- [ ] W04.09 Read individual revisions.
- [ ] W04.10 Compare revisions.
- [ ] W04.11 Restore an earlier revision as current content.
- [ ] W04.12 Archive notes and folders.
- [ ] W04.13 Restore archived notes with unavailable parents.
- [ ] W04.14 Browse note trash.
- [ ] W04.15 Permanently delete individual notes.
- [ ] W04.16 Empty note trash.
- [ ] W04.17 Import a Markdown archive and reconstruct folders.
- [ ] W04.18 Report partial import success and individual failures.

## 05 — Proposed note changes

- [ ] W05.01 Construct targeted edits from quoted text.
- [ ] W05.02 Check applicability before approval.
- [ ] W05.03 Preview targeted edits against the displayed note.
- [ ] W05.04 Review and approve targeted edits.
- [ ] W05.05 Apply approved targeted edits to the saved note.
- [ ] W05.06 Reject invalid, ambiguous, empty, or ineffective edits.
- [ ] W05.07 Report failures and support corrected proposals.
- [ ] W05.08 Preview and approve whole-body replacements.
- [ ] W05.09 Apply approved whole-body replacements.
- [ ] W05.10 Handle intervening changes between proposal, review, and execution.
- [ ] W05.11 Preserve unrelated prose, rich content, and resources.
- [ ] W05.12 Convert between editor documents, Markdown, and plain text.

## 06 — Rich-text editing and clipboard

- [ ] W06.01 Insert and format paragraphs, headings, and inline text.
- [ ] W06.02 Edit lists, task lists, quotations, and code blocks.
- [ ] W06.03 Insert and edit tables.
- [ ] W06.04 Insert and edit mathematical expressions and callouts.
- [ ] W06.05 Insert images, video, audio, and embedded media.
- [ ] W06.06 Resize and align embedded media.
- [ ] W06.07 Insert and edit hyperlinks.
- [ ] W06.08 Insert links to notes and headings.
- [ ] W06.09 Select and execute slash commands.
- [ ] W06.10 Move document blocks.
- [ ] W06.11 Undo and redo editor changes.
- [ ] W06.12 Copy and cut rich selections.
- [ ] W06.13 Copy individual images and diagrams.
- [ ] W06.14 Copy mixed prose and media into external applications.
- [ ] W06.15 Paste rich HTML.
- [ ] W06.16 Recognize and paste structured Markdown.
- [ ] W06.17 Paste literal text.
- [ ] W06.18 Paste screenshots and image files.
- [ ] W06.19 Preserve clipboard content across application boundaries.
- [ ] W06.20 Restore selection and focus after contextual actions.

## 07 — Navigation, numbering, and provenance

- [ ] W07.01 Build and navigate note outlines.
- [ ] W07.02 Configure numbering overrides and inherited defaults.
- [ ] W07.03 Maintain heading and ordered-list numbering.
- [ ] W07.04 Find text and reveal matching passages.
- [ ] W07.05 Search and replace text within a note.
- [ ] W07.06 Search and replace text across notes.
- [ ] W07.07 Follow note links, heading links, references, and backlinks.
- [ ] W07.08 Preview linked references.
- [ ] W07.09 Capture selected passages as durable source references.
- [ ] W07.10 Repair source anchors after changes.
- [ ] W07.11 Handle stale, ambiguous, or missing passages.
- [ ] W07.12 Reconcile links and backlinks after saving.
- [ ] W07.13 Reveal sources from tasks, suggestions, and conversations.

## 08 — Proofreading and inline assistance

- [ ] W08.01 Enable and disable local proofreading.
- [ ] W08.02 Identify and display proofreading issues.
- [ ] W08.03 Apply corrections.
- [ ] W08.04 Dismiss proofreading selections.
- [ ] W08.05 Add accepted words to the local dictionary.
- [ ] W08.06 Restore preferences and accepted words.
- [ ] W08.07 Recover initialization and persistence failures.
- [ ] W08.08 Trigger inline completion from editor context.
- [ ] W08.09 Admit, throttle, and cancel requests.
- [ ] W08.10 Assemble completion context.
- [ ] W08.11 Display, accept, and dismiss inline suggestions.
- [ ] W08.12 Handle stale responses after further edits.

## 09 — Tasks and commitments

- [ ] W09.01 Create individual tasks.
- [ ] W09.02 Create task batches.
- [ ] W09.03 Create tasks through quick entry.
- [ ] W09.04 Edit task text and descriptions.
- [ ] W09.05 Change status and completion.
- [ ] W09.06 Set responsibility, priority, category, and due date.
- [x] W09.07 Discover and reuse categories. [Current callers, values and retained evidence](task-reads.md); implementation remains on the open stack.
- [ ] W09.08 Delete tasks.
- [x] W09.09 List, filter, sort, and count tasks. [Ownership and boundary disposition](task-reads.md); implementation remains on the open stack.
- [ ] W09.10 View tasks as a board or table.
- [ ] W09.11 Move tasks between board statuses.
- [ ] W09.12 Open details and return to the originating view.
- [ ] W09.13 Display and update tasks embedded in notes.
- [ ] W09.14 Extract commitments from selected passages.
- [ ] W09.15 Preserve task provenance through source changes.
- [ ] W09.16 Attach screenshots to descriptions.
- [ ] W09.17 Export boards as Markdown.
- [ ] W09.18 Export boards as PDF.

## 10 — Suggestions, relationships, and references

- [ ] W10.01 Discover related notes from selected passages.
- [ ] W10.02 Discover and rank external references.
- [ ] W10.03 Create suggestions with provenance.
- [ ] W10.04 List and count suggestions by status.
- [ ] W10.05 Expire suggestions.
- [ ] W10.06 Display suggestions inline and in the review panel.
- [ ] W10.07 Modify suggested content before acceptance.
- [ ] W10.08 Accept task suggestions.
- [ ] W10.09 Accept relationship suggestions.
- [ ] W10.10 Accept reference suggestions.
- [ ] W10.11 Accept memory suggestions.
- [ ] W10.12 Accept diagram suggestions.
- [ ] W10.13 Reject suggestions.
- [ ] W10.14 Revert accepted suggestions.
- [ ] W10.15 Keep status and applied effects consistent.
- [ ] W10.16 Maintain relationships and references after source changes.

## 11 — Memory

- [ ] W11.01 List user memory.
- [ ] W11.02 List project memory.
- [ ] W11.03 Create, edit, and delete memory directly.
- [ ] W11.04 Propose additions, changes, and removals.
- [ ] W11.05 Review memory proposals.
- [ ] W11.06 Apply automatic acceptance under trust policies.
- [ ] W11.07 Supply user-profile memory to runs.
- [ ] W11.08 Retrieve project memory for agent work.
- [ ] W11.09 Preserve memory scope and provenance.

## 12 — Skills

- [ ] W12.01 Provision and reconcile built-in definitions.
- [ ] W12.02 Preserve user changes when built-ins evolve.
- [ ] W12.03 Create a skill directly.
- [ ] W12.04 Create a skill from selected content.
- [ ] W12.05 Browse and open skills.
- [ ] W12.06 Import Markdown and metadata.
- [ ] W12.07 Serialize skills for external use.
- [ ] W12.08 Edit metadata and enabled state.
- [ ] W12.09 Save skill content.
- [ ] W12.10 Propose, preview, approve, and apply targeted edits.
- [ ] W12.11 Propose, preview, approve, and replace complete content.
- [x] W12.12 Pin and unpin skills. [Disposition and observed contracts](skill-pins.md); implementation remains in open PR #200.
- [ ] W12.13 Browse skill versions.
- [ ] W12.14 Restore earlier versions.
- [ ] W12.15 Discover and load skills for execution.
- [x] W12.16 Record skill usage. [Ownership, failure and storage evidence](skill-loads.md); implementation remains in open PR #203.

## 13 — Diagrams

- [ ] W13.01 Create diagrams through conversations.
- [ ] W13.02 Create and open project diagrams.
- [ ] W13.03 Generate Mermaid from selected text.
- [ ] W13.04 Revise inline Mermaid.
- [ ] W13.05 Revise durable Mermaid.
- [ ] W13.06 Propose Mermaid-to-draw.io conversion.
- [ ] W13.07 Review, modify, accept, or reject conversions.
- [ ] W13.08 Insert project diagrams into notes.
- [ ] W13.09 Read conversation and project diagrams.
- [ ] W13.10 Edit through agent proposals.
- [ ] W13.11 Initialize the embedded draw.io editor.
- [ ] W13.12 Exchange loads, autosaves, and exports with draw.io.
- [ ] W13.13 Recover failed editor communication.
- [ ] W13.14 Save drafts.
- [ ] W13.15 Publish diagrams.
- [ ] W13.16 Browse and read revisions.
- [ ] W13.17 Restore earlier revisions.
- [ ] W13.18 Rename diagrams.
- [ ] W13.19 Archive and restore diagrams.
- [ ] W13.20 Browse diagram trash.
- [ ] W13.21 Inspect references before deletion.
- [ ] W13.22 Permanently delete diagrams.
- [ ] W13.23 Remove embedded diagrams and reconcile references.
- [ ] W13.24 Search diagram icons.
- [ ] W13.25 Render Mermaid and draw.io previews.
- [ ] W13.26 Export diagrams with image and theme settings.
- [ ] W13.27 Hand diagrams between conversations, canvases, notes, and projects.

## 14 — Attachments

- [ ] W14.01 Reserve uploads and issue destinations.
- [ ] W14.02 Upload and finalize note attachments.
- [ ] W14.03 Upload and finalize task screenshots.
- [ ] W14.04 Validate content and duplicate-upload behavior.
- [ ] W14.05 Extract text from documents.
- [ ] W14.06 Describe uploaded images.
- [ ] W14.07 Report processing failures and retry extraction.
- [ ] W14.08 List attachments by note, task, and project.
- [ ] W14.09 Read extracted content.
- [ ] W14.10 Download by identity or note-relative path.
- [ ] W14.11 Serve authenticated browser content requests.
- [ ] W14.12 Remove records and stored objects.
- [ ] W14.13 Snapshot attachments with revisions.
- [ ] W14.14 Restore attachment snapshots.
- [ ] W14.15 Reclaim expired reservations and abandoned objects.

## 15 — Documents and generated artifacts

- [ ] W15.01 Upload and finalize templates.
- [ ] W15.02 Validate template structure and styles.
- [ ] W15.03 List and delete templates.
- [ ] W15.04 Read and update export settings.
- [ ] W15.05 Select notes, folders, and entries for export.
- [ ] W15.06 Assemble ordered export content.
- [ ] W15.07 Render embedded diagrams and images for export.
- [ ] W15.08 Preview exports.
- [ ] W15.09 Generate PDF documents.
- [ ] W15.10 Generate DOCX documents.
- [ ] W15.11 Generate bundles.
- [ ] W15.12 Record artifacts and source information.
- [ ] W15.13 List and inspect artifacts.
- [ ] W15.14 Download artifacts.
- [ ] W15.15 Regenerate artifacts.
- [ ] W15.16 Delete artifacts.

## 16 — Conversations and context

- [ ] W16.01 Start and stage conversations.
- [ ] W16.02 Choose models and execution settings.
- [ ] W16.03 Resolve conversation, user, and deployment settings.
- [ ] W16.04 Attach notes and resources.
- [ ] W16.05 Expand folder attachments into included notes.
- [ ] W16.06 Attach selected passages and images.
- [ ] W16.07 Remove attached context.
- [ ] W16.08 Capture panes, focus, and conversation origin.
- [ ] W16.09 Handle project changes during conversations.
- [ ] W16.10 Send user messages.
- [ ] W16.11 Edit and resubmit earlier messages.
- [ ] W16.12 Rewind persisted history for resubmission.
- [ ] W16.13 Browse and reopen conversations.
- [ ] W16.14 Rename conversations.
- [ ] W16.15 Delete conversations.
- [ ] W16.16 Restore local drafts and choices.
- [ ] W16.17 Recover corrupt persistence.
- [ ] W16.18 Coordinate concurrent and resident sessions.
- [ ] W16.19 Persist text, reasoning, and tool activity.
- [ ] W16.20 Condense dialogue into search intent.
- [ ] W16.21 Replay history and externalize large payloads.

## 17 — Agent runs and approvals

- [ ] W17.01 Submit and persist chat runs.
- [ ] W17.02 Submit and persist selection-driven runs.
- [ ] W17.03 Claim and start runs.
- [ ] W17.04 Resolve and freeze inputs.
- [ ] W17.05 Execute turns and dependent actions.
- [ ] W17.06 Record and stream events.
- [ ] W17.07 Reconnect and reconcile snapshots.
- [ ] W17.08 Restore selection-driven actions after reload.
- [ ] W17.09 Display messages, progress, and terminal outcomes.
- [ ] W17.10 Present tool arguments and results.
- [ ] W17.11 Pause for approval.
- [ ] W17.12 Approve or reject individual calls.
- [ ] W17.13 Approve or reject batches.
- [ ] W17.14 Resume after decisions.
- [ ] W17.15 Apply automatic approval and trust.
- [ ] W17.16 Return inapplicable proposals as actionable failures before approval.
- [ ] W17.17 Cancel running and approval-paused work.
- [ ] W17.18 Retry failed runs.
- [ ] W17.19 Handle duplicate submissions and decisions.
- [ ] W17.20 Settle interrupted or abandoned calls.
- [ ] W17.21 Enforce turn and concurrency limits.
- [ ] W17.22 Persist terminal states consistently.

## 18 — Tools, research, and MCP

- [ ] W18.01 Build and classify the tool catalog.
- [ ] W18.02 Expose frequently used tools directly.
- [ ] W18.03 Discover additional tools semantically.
- [ ] W18.04 Promote discovered tools into the callable surface.
- [ ] W18.05 Validate inputs and dispatch capabilities.
- [ ] W18.06 Recover unknown names and invalid arguments.
- [ ] W18.07 Return actionable tool failures.
- [ ] W18.08 List and search workspace files.
- [ ] W18.09 Read selected file ranges.
- [ ] W18.10 Expose large outputs as files.
- [ ] W18.11 Perform external web research.
- [ ] W18.12 List tool preferences.
- [ ] W18.13 Enable and disable workspace tools.
- [ ] W18.14 Set project overrides.
- [ ] W18.15 Clear overrides and restore inheritance.
- [ ] W18.16 Preserve required recovery tools.
- [ ] W18.17 List and update trust policies.
- [ ] W18.18 Authenticate and initialize MCP requests.
- [ ] W18.19 Discover and register MCP tools.
- [ ] W18.20 Execute and return MCP results.
- [ ] W18.21 Seed and refresh discovery embeddings.

## 19 — Models and agent preferences

- [ ] W19.01 List available models.
- [ ] W19.02 Validate chat-model choices.
- [ ] W19.03 Validate vision-model choices.
- [ ] W19.04 Validate inline-completion choices.
- [ ] W19.05 Configure attachment-processing models.
- [ ] W19.06 Configure web research and result settings.
- [ ] W19.07 Configure turn limits and execution mode.
- [ ] W19.08 Read effective user and deployment defaults.
- [ ] W19.09 Preview and approve agent-proposed settings changes.
- [ ] W19.10 Persist and synchronize preferences.

## 20 — Knowledge search and indexing

- [ ] W20.01 Search project and workspace knowledge.
- [ ] W20.02 Retrieve and rerank results.
- [ ] W20.03 Project results for users and agents.
- [ ] W20.04 Split sources into searchable chunks.
- [ ] W20.05 Index changed notes and associated content.
- [ ] W20.06 Index extracted attachments.
- [ ] W20.07 Retire removed or changed source content.
- [ ] W20.08 Preserve usable search during replacement.
- [ ] W20.09 Backfill embeddings.
- [ ] W20.10 Retry failures without blocking other sources.
- [ ] W20.11 Reject stale indexing results.

## 21 — Offline writes and conflicts

- [ ] W21.01 Prepare optimistic commands.
- [ ] W21.02 Establish required inventory completeness.
- [ ] W21.03 Persist edits and durable queued writes.
- [ ] W21.04 Preserve ordering and dependencies.
- [ ] W21.05 Submit queued writes.
- [ ] W21.06 Reconcile writes and receipts.
- [ ] W21.07 Deduplicate already-applied mutations.
- [ ] W21.08 Detect stale bases and conflicts.
- [ ] W21.09 Refresh remote state during review.
- [ ] W21.10 Keep local changes against a refreshed base.
- [ ] W21.11 Discard local changes.
- [ ] W21.12 Retry rejected or interrupted submissions.
- [ ] W21.13 Cancel queued writes.
- [ ] W21.14 Resolve uncertain server outcomes.
- [ ] W21.15 Recover pending work after interruption.
- [ ] W21.16 Coordinate ownership across tabs.
- [ ] W21.17 Synchronize note lifecycle operations.
- [ ] W21.18 Synchronize tasks.
- [ ] W21.19 Synchronize projects and folders.
- [ ] W21.20 Synchronize diagrams.
- [ ] W21.21 Synchronize skill metadata.
- [ ] W21.22 Synchronize memory.
- [ ] W21.23 Synchronize conversation names.
- [ ] W21.24 Synchronize user, agent, tool, trust, and export preferences.

## 22 — Downloads and local recovery

- [ ] W22.01 Download initial record inventories.
- [ ] W22.02 Pull incremental change pages.
- [ ] W22.03 Fetch bodies by identity and version.
- [ ] W22.04 Reuse unchanged cached resources.
- [ ] W22.05 Reconcile remote changes with drafts and writes.
- [ ] W22.06 Observe local records across views.
- [ ] W22.07 Schedule and retry downloads.
- [ ] W22.08 Pause and resume with connectivity.
- [ ] W22.09 Recover invalid cursors and incomplete state.
- [ ] W22.10 Detect local storage failures.
- [ ] W22.11 Export unsynchronized work for recovery.
- [ ] W22.12 Reset account-local storage.
- [ ] W22.13 Restore editor checkpoints.
- [ ] W22.14 Flush editor changes during lifecycle transitions.
- [ ] W22.15 Isolate data and work by account.

## 23 — Workbench and commands

- [ ] W23.01 Open foreground and background tabs.
- [ ] W23.02 Focus, replace, reorder, and move tabs.
- [ ] W23.03 Pin and unpin tabs.
- [ ] W23.04 Close tabs and tab groups.
- [ ] W23.05 Remove tabs for unavailable resources.
- [ ] W23.06 Open and close split panes.
- [ ] W23.07 Resize splits.
- [ ] W23.08 Drag tabs between panes.
- [ ] W23.09 Restore tabs, panes, and split ratios.
- [ ] W23.10 Reconcile URLs and workbench state.
- [ ] W23.11 Navigate to project overview.
- [ ] W23.12 Open chat, task, memory, suggestion, and search panels.
- [ ] W23.13 Restore panel focus.
- [ ] W23.14 Coordinate surfaces under constrained space.
- [ ] W23.15 Resize and persist sidebar geometry.
- [ ] W23.16 Toggle tab-strip visibility.
- [ ] W23.17 Open and filter the command palette.
- [ ] W23.18 Execute shortcuts and multi-key commands.
- [ ] W23.19 Navigate to quick capture and task creation.
- [ ] W23.20 Toggle and persist theme.

## 24 — Offline application lifecycle

- [ ] W24.01 Install and activate the service worker.
- [ ] W24.02 Cache public assets.
- [ ] W24.03 Serve offline navigation.
- [ ] W24.04 Update caches between versions.
- [ ] W24.05 Recover unavailable resources with supported offline content.
- [ ] W24.06 Start from persisted offline state.

## 25 — Feedback and observability

- [ ] W25.01 Submit feedback.
- [ ] W25.02 Report browser errors.
- [ ] W25.03 Return user-facing server failures.
- [ ] W25.04 Display error recovery surfaces.
- [ ] W25.05 Trace controller operations.
- [ ] W25.06 Trace runs, provider calls, and tools.
- [ ] W25.07 Associate logs, traces, and run identities.
- [ ] W25.08 Export and flush telemetry.
- [ ] W25.09 Inspect and audit recorded traces.

## 26 — Startup and background work

- [ ] W26.01 Load and validate configuration and secrets.
- [ ] W26.02 Construct web and worker dependencies.
- [ ] W26.03 Initialize instrumentation.
- [ ] W26.04 Start scheduled tasks.
- [ ] W26.05 Run embedding maintenance.
- [ ] W26.06 Run expired-upload cleanup.
- [ ] W26.07 Handle maintenance failures and retries.
- [ ] W26.08 Drain work during shutdown.
- [ ] W26.09 Build and start web and worker processes.

## 27 — Verification and safeguards

- [ ] W27.01 Construct fixtures and in-memory fakes.
- [ ] W27.02 Verify domain behavior.
- [ ] W27.03 Verify controller workflows with stateful dependencies.
- [ ] W27.04 Verify database repository contracts.
- [ ] W27.05 Verify browser journeys.
- [ ] W27.06 Validate real editor-document corpus cases.
- [ ] W27.07 Evaluate agent intent, actions, effects, and stopping.
- [ ] W27.08 Evaluate multi-turn and recovery behavior.
- [ ] W27.09 Cache and replay evaluation dependencies.
- [ ] W27.10 Judge and aggregate evaluation outcomes.
- [ ] W27.11 Record evaluation evidence.
- [ ] W27.12 Audit architectural and source constraints.
- [ ] W27.13 Audit test structure and quality.
- [ ] W27.14 Audit UI rules and surface text.
- [ ] W27.15 Validate documentation and build output.

## 28 — Coverage reconciliation

- [ ] W28.01 Map every controller capability to workflows.
- [ ] W28.02 Map every remote function and route to workflows.
- [ ] W28.03 Map every agent and MCP tool to workflows.
- [ ] W28.04 Map background and startup actions to workflows.
- [ ] W28.05 Map client commands, stores, extensions, and component actions.
- [ ] W28.06 Map every domain object and schema.
- [ ] W28.07 Map every behavior test to a guarantee.
- [ ] W28.08 Classify supporting infrastructure, missed workflows, and obsolete behavior.
