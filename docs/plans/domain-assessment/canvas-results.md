# Conversation canvas result boundary

## Meaning and entry paths

DiagramStudio.readCanvasDiagram asks PresentedCanvasSource for the last diagram written in the
actor's conversation, then reads the current diagram row through DiagramFinder. The transcript names
the diagram; it is not the authority for its current source. ADR 0035 preserves this recovery path
when other large tool results become files.

The production factory supplies AgentSessionRecords directly. It now exposes an ordered, actor-owned
canvas-result projection from the entire transcript. The repository mapper decodes the known
create_diagram/edit_diagram output payload. Models hold its schema and written/unrelated/corrupt
result union. The service no longer parses JSON or declares a schema. It owns the reverse selection
of the latest successful result. No repository decides which diagram is current.

Preserve the existing single-output rule: strings and single text parts can carry a diagram identity;
multipart outputs do not claim one combined JSON value. Failed writes and unrelated tools do not
erase a previously saved canvas. Malformed JSON fails when selection reaches it. A newer successful
write supersedes older malformed output. Returning corruption as a typed read result preserves that
order-dependent behavior without parsing inside the service. No read cap or migration is introduced.

## Test dispositions and remaining review

Keep the five canvas behavior cases and replace the local structural stub with the shared session
repository fake. Add failed-write preservation, corruption before and after the latest successful
write, and long-history coverage. Mapper cases cover plain strings, multipart output, unrelated
malformed payloads and blank identities. Add PostgreSQL contracts for ordering, actor isolation and
both corruption positions. Existing diagram controller tests retain current-row source recovery.

The session-item parser and storage constructor remain canonical boundary/value conversion code.
sessionOutputText remains a representation accessor with explicitly tested multipart behavior; it
does not choose the current canvas. The wider provider representation, diagram declaration and
workflow inventory still require review. Observed validation belongs to the dependent PR.
