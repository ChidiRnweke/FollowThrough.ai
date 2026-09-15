# Content, documents, and source identity

Snapshot: `74215c9acf3e0461dfa41b598338fa168a0754b4`. Covers workflow families
03–08 and 12–15. Paths below are repository-relative. **Static** means source-confirmed,
not a reproduced user journey. **Reproduced** means the input/output was executed locally.
Tests named below were inspected; fresh execution results live in `validation.md`.

## Semantic map

| Concept                   | Meaning and guarantees                                                                 | Existing ownership                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Project contents          | Ordered, acyclic placement within an owned project; missing cached data is not absence | Shared project/note decisions, `ProjectCatalog`, workspace preparation                             |
| Note draft                | Current authored content with coherent anchors, links, and search                      | `Notes.save`, discard/restore, `Skills.saveDocument`, `NoteCatalog`                                |
| Published revision        | Immutable restore point, separate from editable content; includes attachment versions  | Note/skill controllers and revision recorder                                                       |
| Proposed note change      | A change the user can inspect and authorize against a particular state                 | Tool arguments, preflight, browser preview, patching and save currently divide this responsibility |
| Note content              | Rich document with explicit Markdown/plain-text representations                        | Model schema and editor converters shared with server callers                                      |
| Selection origin          | A verified source revision and quotation with producer provenance                      | `SelectionOrigins.resolve/record` and `proposalFromSelection`                                      |
| Skill                     | Reusable instructions with discovery metadata and usage                                | `Skills`, `SkillLibrary.prepareEdit/commitEdit`, note services                                     |
| Diagram draft/publication | Editable source, renderable publication, history and references                        | Studio controller, library, canvas and draw.io protocol                                            |
| Attachment version        | Binary object plus extraction and indexing outcome                                     | Upload reservation, attachment library, processing and retention                                   |
| Document edition          | Ordered sources, effective settings and assets chosen for generation                   | `ArtifactLibrary`, export dialogs, templates and generators                                        |
| Generated artifact        | Durable bytes and metadata describing a generated document                             | Artifact repository/storage; distinct from generating current sources again                        |
| Clipboard selection       | Portable content transferred from a live browser selection                             | Editor clipboard/media helpers                                                                     |
| Personal dictionary       | Device-local accepted vocabulary                                                       | Proofreading store and lazy Harper worker                                                          |
| Inline writing suggestion | Optional text tied to a live editing context                                           | Inline admission/context/completion and editor extension                                           |

These are responsibilities to establish, not a mandate to generate a class for every noun.
Private matching loops and browser protocol helpers can remain private functions under a coherent owner.

## Entry points and consequences

| Workflows                        | Trace to inspect in both directions                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project creation/placement/trash | Project tree/actions, remotes and agent tools → `Projects`/`Notes` → shared decisions → catalog/repository; optimistic commands use the same rules                   |
| Note edits/history               | Editor sessions, workspace writes, agent `save_note`/`edit_note`, history remotes → `Notes` → content, anchor, link, revision, attachment and indexing collaborators |
| Proposals                        | Tool factory preflight + browser `previewNoteEdits` → tool execution → `Notes.save`; inspect changes between each phase                                              |
| Selection actions                | Editor selection → remote action → action run → `SelectionOrigins` → domain proposal and provenance                                                                  |
| Skills                           | Skill editor/import/agent/selection → `Skills` → prepared metadata/document edit → note services and skill commit                                                    |
| Diagrams                         | Studio/gallery/canvas/agent/editor reference → diagram controllers → library/render/index → diagram versions and references                                          |
| Uploads                          | Paste/drop/attachment UI → initiation/completion → committed version → asynchronous extraction/indexing; retention is a separate worker path                         |
| Exports                          | Single/bulk dialogs prepare assets → remotes/controller → `ArtifactLibrary` → PDF/DOCX/bundle → bytes and metadata                                                   |
| Clipboard                        | Selection/context menu → editor serializers, media fetch/render → clipboard write → external paste                                                                   |
| Proofreading/completion          | Local dictionary/checker versus remote admission/generation → editor lifetime/caret checks → optional insertion                                                      |

## Findings and implementation requirements

### C01 — Exact replacements interpret JavaScript substitution syntax

**Reproduced.** `src/lib/models/notes/note-patch.ts:applyNotePatch` uses
`working.replace(oldText, newText)` for a unique exact match. Replacing `old` with `$&`
returns `old` and reports one applied edit. Tolerant and replace-all branches insert literal strings.

Fix the unique-match replacement using span concatenation or a callback. Keep one literal-text
contract across all matching branches. In `note-patch.spec.ts`, verify `$&`, `$$`, prefix and suffix
replacement tokens, exact/tolerant/replace-all behavior, sequential edits, and atomic failure.
No new service interface or dependency injection is needed for this correction.

### C02 — Preservation and global normalization contradict each other

**Reproduced.** Patching `A\r\nold\r\nZ` to replace `old` with `new` returns `A\nnew\nZ`.
The tests independently promise byte-identical surrounding text and Windows-ending normalization.
Their fixtures never force those promises to meet.

Normalize the comparison representation only; map matched spans back to original source bytes.
Preserve supplied replacement bytes. Rewrite the normalization test as matching tolerance.
Add untouched CRLF and mixed-ending cases. Keep rich-node round-trip tests at the document boundary:
the string algorithm cannot establish preservation through Markdown/editor conversion by itself.

### C03 — A preview is not a revision-bound approval

**Static.** `src/lib/server/factories/agent/agent-tool-factory.ts` callbacks for note and skill
editing load, serialize, patch, convert and save. Their feasibility callbacks repeat some of that
work. `src/lib/client/notes/note-patch-preview.ts` previews another loaded note and claims shared
code prevents disagreement. The arguments do not bind approval to the reviewed version.

Define the product meaning of a proposed change before moving functions. Recommended contract:
target, reviewed base version, and prepared result form one reviewable value; approval authorizes
that value. A changed base yields an explicit stale-review outcome and renewed review. Apply this
to targeted edits and whole-body replacements. This is an approval protocol change, not a rename.

Before implementation, settle whether the product instead intentionally authorizes reapplication
to later content. Record the decision; do not infer it from current behavior. Test change-after-preview,
change-after-approval, unchanged retry, rejected anchors, and exact preview/result agreement.

### C04 — Previously missing body-change consequences are repaired but repeated

**Static duplication, not an outstanding omission.** PR #48 repaired discard/restore and skill
body consequences. `Notes.save/discardDraft/restoreRevision` and `Skills.saveDocument` still repeat
the sequence of saving, repairing anchors, reconciling links and indexing.

Consolidate only the shared content-change guarantee at the controller orchestration level. Keep
snapshot choice, attachment restoration, publication and skill metadata under their own workflows.
Do not introduce a service importing unrelated services against ADR 0007. Test final saved state
and transactional rollback for every exposed body-changing route; avoid merely recording helper calls.

### C05 — Skill identity and history need explicit meanings

**Static/open.** Metadata-only updates can change `skill.name` independently of note title.
Document edits can change both. Skill restoration records a new snapshot while ordinary note
restoration does not. Current skill restoration tests intentionally assert that snapshot.
`NoteCatalog` trash/deletion paths exclude skills.

Settle whether display name/title are distinct facts and whether skills intentionally have a
different snapshot policy. Then consolidate or name the differences. Review user-authored skill
trash separately from built-in reprovisioning. Test rename paths, archived discovery, pins, restore,
deletion and built-in reconciliation. Preserve the new draft/import/concurrency tests from PR #48.

### C06 — Durable upload completion does not prove durable processing startup

**Static.** `Attachments.completeAndStart` commits a queued version and starts processing afterward.
Attachment recovery selects `processing` rows; a crash before startup can leave `queued` work outside
that selection. `AttachmentVersion` also permits loosely related optional results beside six statuses.

Extend the existing composition plan's attachment-recovery stage. Recover queued and interrupted
versions using database-backed claims; scheduling must not be the sole evidence work exists.
Test crash-after-commit, mid-extraction interruption, competing claims, repeated completion, retry,
and cleanup failure. Derive truthful state variants from those production transitions. Distinguish
partial extraction from partial indexing before revising the model.

### C07 — Diagram draft and deletion consequences need scenario verification

**Static.** `DiagramStudio.saveProjectDiagramDraft` saves then indexes without the controller
transaction used by publication/restoration. Deletion delegates to row deletion while reference
counting is a separate capability.

Reproduce index failure after a draft save and rendering a note after referenced-diagram deletion.
Define the persistence outcome and reference policy before changing behavior. Test stale saves,
canvas/agent races, publication history and references. Retain iframe protocol tests: they protect
real browser requirements. No diagram-corruption reproduction is claimed here.

### C08 — Clipboard success can conceal nonportable media

**Static.** `components/edra/commands/clipboard-payload.ts:buildRichClipboard` limits rendered media
and embedded bytes, and can leave authenticated image URLs when fetching fails. `{ html, text }`
does not distinguish portable output from degraded transfer.

Define complete/degraded transfer results and expose unavailable media. Measure retained resource
ceilings rather than replacing them with another guess. Preserve clipboard writes initiated while
browser user activation is alive. Verify actual external paste, authenticated image failure, mixed
media, limits, lone diagrams and context-menu selection. Existing paste/selection tests are valuable.

### C09 — Regeneration is current-state generation with different preparation

**Static.** `DeliverablesController.regenerateArtifact` explicitly uses current note state.
`ArtifactLibrary.regenerate` forwards stored source IDs/title/format/template but lacks original
browser-equivalent diagram render preparation and does not retain one-off settings. Fresh settings
are compatible with current-state regeneration; they need an explicit contract. The test named “regenerates from the original artifact
inputs” checks only some of those fields. Regeneration also lacks generation's outer transaction,
so provenance can survive a later artifact-insert failure.

Keep documented current-state semantics. Share complete current asset preparation and durable artifact
creation. Test actual generated diagram/image output, changed settings and provenance rollback.
Do not add historical source replay unless separately chosen. Inspect object retention before changing
metadata-only artifact deletion: object storage cannot roll back with database transactions.

### C10 — An unavailable selected template falls back to defaults

**Static.** Template initiation stores staging data in an ordinary `ProjectTemplate`; listing does
not represent pending versus usable state. `ArtifactLibrary.templateStyles` returns `undefined` for
a missing/unready explicitly selected template, making default styling look like success.

Separate upload reservation and usable template state. Only completed templates are selectable.
Explicit missing/unready choices fail. Test repeated completion, extraction failure after promotion,
unfinished listing, actual size/checksum verification, and requested missing templates. Preserve
retries across storage promotion and extraction; inspect storage semantics before coding recovery.

### C11 — Archive links resolve duplicate titles by insertion order

**Static.** Import creates identities before content, correctly allowing forward links. Its global
lowercase title-to-ID map is last-wins although duplicate titles across folders are permitted.
Folder creation also occurs outside per-note error collection.

Define archive reference identity: normalized paths for qualified links and unique-title resolution
for bare links; ambiguous links stay explicit. Extend partial import outcomes to failed folders and
blocked descendants while retaining independent successes. Preserve ADR 0014's accepted partial imports
and blank shells. Test duplicate titles, forward qualified links, failed parent folders and independent branches.

### C12 — Cross-note replacement can fail after earlier notes have changed

**Static.** `Notes.replaceText` loops over notes and invokes transactional `save` for each one.
A later failure throws after earlier per-note commits. This is a batch outcome question separate from
literal replacement inside one document.

Choose atomic replacement across the selection or explicit per-note partial results. Do not silently
pick the policy while extracting helpers. Fail the second save in a stateful test and inspect both
stored notes and the returned failure information. Preserve successful retry and concurrent-edit guards.

## Necessary complexity and evidence to retain

- Shared placement rules and completeness checks now implement ADR 0041; no second browser/server
  implementation should be introduced by changing representation.
- `SelectionOrigins` now centralizes revision/text validation and provenance. Do not re-extract it.
- `artifacts.spec.ts`: “previews the selected notes without creating an artifact” and inaccessible-note
  rejection distinguish generation from preview.
- PDF hyperlink annotations and DOCX hyperlink/numbering relationships are different format guarantees.
  Visible `[image unavailable]` placeholders are explicit degradation, not silent omissions.
- Bundle tests distinguish individual-document content from exporting the entire selection and explicitly
  establish that a bundle download is not a durable artifact.
- Clipboard tests preserve prices without math conversion, copied headings, Snipping Tool images, and
  prose around diagrams. Browser activation/HTML/Markdown branches are not redundant by default.
- Proofreading restores local dictionaries, reports corrupt persistence, and lazily loads the checker.
  ADR 0012's privacy guarantee should remain independent of remote completion.
- `InlineSuggestion.ts` already aborts superseded work and checks controller identity/caret origin.
  Add edit-with-unchanged-caret, composition and disposal scenarios before declaring that defense absent.

## Historical findings retired by current evidence

PR #47 resolved duplicated placement/archive/restore implementations. PR #48 resolved missing note
discard/restore consequences and direct skill content/history writes. PR #50 resolved duplicated
selection origins. Expired upload cleanup already removes bytes before dropping its reservation.
Folder archive already rejects active contents. These are not pending fixes; older suspicious findings
and unchecked historical checklists must not override inspected current code.
