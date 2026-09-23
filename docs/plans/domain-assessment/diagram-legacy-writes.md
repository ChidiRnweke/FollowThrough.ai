# Retired draw.io save surfaces

The current editor sends draft and publication commands through workspace synchronization. The
server dispatches them to DiagramStudio.saveProjectDiagramDraft and publishProjectDiagram. No
production caller uses Diagrams.getDrawio, Diagrams.saveDrawio or DiagramStudio.saveProjectDrawio.
The similarly named getDrawioDiagram component callback reads a cached reference; it is unrelated.
The old methods bypassed revision checks and did not represent the active editing protocol.

Remove those three methods, their capability classifications and their four request/response types.
Remove the validation dependencies used only by the retired Diagrams save path. DiagramStudio's
creation port exposes only create; it cannot request a general update. Public workspace commands,
remote queries, agent tools and their responses do not change. The historical source inventory
retains the old declarations as a snapshot, not a list of live capabilities.

## Test dispositions

- Move preview-required, XML validation, SVG sanitization, label extraction and source replacement
  checks to content-publication.spec.ts against the active controller and real validators.
- Consolidate duplicate indexing tests into a search-result check using the real content index,
  an embedding fake and the source-note title. It verifies the saved diagram's identity.
- Rewrite indexing rollback to fail embedding after revision/history writes, then verify both roll
  back. Preserve the missing source-note rollback guarantee on the same active path.
- Move actor ownership and diagram-kind refusal to publication. Remove the unused note-parameter
  mismatch test: the active protocol addresses diagrams by their own identity and checks actor ownership.
- Remove the obsolete last-save-wins framing. Existing publication.spec.ts, write-outcomes.spec.ts and
  sync/diagram-mutations.contract.spec.ts retain revision conflict and replay guarantees; they are not replaced by
  the migrated content tests.

These dispositions cover the retired declarations and their tests, not all of W13.09–W13.15.
Editor communication and complete workflow coverage remain open. The subsequent
[content-persistence slice](diagram-content.md) replaces the general write used by Mermaid revisions
and reviewed new conversion artifacts.
