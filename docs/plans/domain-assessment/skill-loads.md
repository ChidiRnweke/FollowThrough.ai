# Skill loading and usage ownership

W12.15's load_skill tool calls Skills.loadForAgent with the execution provenance and optional context
note. Skills.get is a read-only editor view. W12.16 records a usage for an agent load, including a
context-free load, and resolves accessible context-note labels for the returned history.

Previously, loadForAgent read the skill, committed a usage, then assembled the response without a
controller transaction. A history lookup failure rejected the load but left its usage committed.
The controller now keeps loading, recording and response assembly in one transaction. A failed
response rolls back that invocation's usage. This counts successful application loads; it cannot
prove that a client received the response after commit, and it does not add a new delivery protocol.

SkillLibrary retains actor checks for the skill, optional context and required provenance. A context
can be in another owned project. An explicit load remains distinct from implicit catalog selection;
this change does not turn the enabled flag into a new authorization policy. Read-only get continues
to create no usage. Usage records retain independently nullable context/provenance references after
deletion, as recorded in the skill value disposition.

## Archived discovery

Server discovery now excludes archived skill notes as well as archived source projects. SkillLibrary
refuses an archived skill load, preventing usage writes for that load. Browser WorkspaceViews already
builds its catalog from active notes. Repository reads needed for repair and edit guards still expose the archived row;
they do not silently reinterpret an archived record as a missing metadata row. This does not add a
skill trash command or change built-in repair policy.

## Evidence

Two controller regressions failed against the previous flow: a history read failure retained usage,
and an archived load succeeded and recorded usage. The corrected flow rejects both and stores no
usage. Existing agent-tool tests still verify Markdown instructions and metadata without exposing
note rows, editor JSON or usage telemetry. Their shared fixture now supplies the real controller's
transaction dependency. The repository fake follows actor checks on usage reads and writes.

Five PostgreSQL cases cover cross-project context with a read-only follow-up, context-free loading,
foreign context, foreign provenance and archived discovery/loading. PostgreSQL execution requires CI
because Docker is unavailable locally. The response-failure rollback regression uses the transaction
fake and a repository read failure; it is not represented as an observed PostgreSQL fault injection.

Portable-name legacy collisions, broader catalog ordering and the unresolved restoration-history
policy remain outside this slice. Repository-wide assessment completion is not implied.
