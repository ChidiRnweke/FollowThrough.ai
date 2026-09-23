# Diagram content persistence

After retirement of the legacy draw.io saves, the general DiagramWriter.update had two callers:
Diagrams.reviseMermaid and Suggestions.accept's reviewed draw.io branch. Neither changes placement,
source anchors, ownership or publication state. The former replaces generated content and its origin;
the latter supplies reviewed content to the new conversion artifact inside acceptance's transaction.

DiagramContentWrite now carries those resolved values in separate Mermaid and draw.io arms. The
Mermaid arm requires the generation provenance and a resolved title. The draw.io arm carries expected
document/publication revisions and cannot replace origin or title. Both carry expected update time,
new update time, source, preview and searchable labels. There are no optional undecided fields.

Controllers retain transactions and preparation. Mermaid holds the authoritative row lock from the
concurrency slice. Suggestion acceptance owns the newly inserted artifact in its transaction. The
catalog checks owned generation provenance and persists the resolved write. PostgreSQL guards actor,
kind, active state and expected values. It updates only content fields, plus Mermaid title/provenance.
The old general catalog/repository update and fake replacements are removed.

## Confirmed defect and test dispositions

The prior PostgreSQL update omitted provenanceId even though the Mermaid controller supplied it.
The fake stored that field, so controller tests did not reveal the lost generation origin. The new
PostgreSQL contract performs a real revision and compares returned and stored provenance with the
generation's provenance record. Another contract verifies that reviewed conversion content retains
identity, placement, origin and publication fields. These contracts need CI's PostgreSQL runner.

Keep generation concurrency, failed indexing/run settlement and reviewed acceptance rollback tests.
Rewrite the general-update source-note preservation test as a targeted content preservation test.
Remove the project/source-note reassignment tests for that removed API: the new write type cannot
express those operations. Creation's existing project/note/actor validation tests remain. Add refusal
tests for foreign actors, changed publication state and missing owned provenance. Shared fakes apply
the same targeted fields and guards instead of replacing the complete diagram.

The prior broad fake also replaced archive state, unlike PostgreSQL; the concurrency disposition
records that distinction. Neither new persistence implementation changes archive state. Public
commands and responses are unchanged and no migration is needed. Complete diagram workflow review,
model label helpers, and project/folder lifecycle coordination remain open.
