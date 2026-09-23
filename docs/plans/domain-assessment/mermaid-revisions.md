# Mermaid revision concurrency

Diagrams.reviseMermaid reads the actor-owned source before generation. The provider runs outside
the publication transaction. Publication now locks and rereads the diagram before preparing a
replacement. The server rule refuses an archived diagram or a changed source, title, provenance,
kind or update timestamp. It prepares the new content from the authoritative row. The controller
persists, indexes and completes the generation run in one transaction. A rejected publication
leaves the peer's diagram intact and records a failed generation run.

The previous callback rebuilt the complete diagram from its pre-generation read. Two controller
regressions reproduced a lost peer edit and publication after a peer archive. Both now fail
publication and preserve the peer state. PostgreSQL contracts hold those peer writes open until
publication waits on their row lock, then check refusal, saved state and failed run settlement.
Existing rendered-output, title preservation and indexing rollback tests remain relevant.

Mermaid has no draw.io document revision counter. The rule therefore compares its authored base
and update timestamp; it does not invent a document revision or change the public request. The
existing general update is safe here because it receives the authoritative locked row, but its
remaining callers and replacement with narrower persistence values still need disposition.
The broad fake replaced archive and provenance fields, while PostgreSQL's general update kept
those fields. The archive regression therefore also exposed a fake mismatch: production could
change archived content, while the fake additionally restored it. Both now refuse publication.
Persisting generation provenance and aligning these remaining persistence implementations are open.
Legacy draw.io controller methods and reviewed suggestion content writes remain separate work.
This slice does not complete the diagram family or the repository assessment.
