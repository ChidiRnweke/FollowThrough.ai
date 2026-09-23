# Extracted commitment owners

The task workflow review found a lost value at W09.14's proposal boundary. Both the deterministic
extractor and model discovery produce PromiseCandidate.ownerName. Todos.saveExtractedPromises copied
the action, responsibility, dates and strength into the proposal but omitted the owner. Thus Maya will
send the draft produced a waiting-on task without Maya, even though extraction had retained her name.

The controller now supplies that name as waitingOn for waiting_on candidates. For mine candidates it
leaves waitingOn absent. Unknown owners remain absent; no default person is invented. Reviewable
suggestions retain the name, and automatic acceptance uses the existing shared task-creation rule.
Manual acceptance also passes the stored payload through that shared rule. The rule still trims
waitingOn and removes it for mine responsibility.

Both synchronous extraction and durable promise runs call saveExtractedPromises. This correction
changes neither their transaction boundaries nor the trust decision. Source anchors, provenance,
accepted effect records, candidate order and stale-selection validation remain unchanged. The task
and suggestion schemas already contain waitingOn, so no migration or public shape change is needed.

## Evidence

The test source contains Maya will send the draft and the extraction fake returns Maya as owner.
Before the fix, both reviewed and automatically accepted cases lost that name. The two regressions
failed while the other fourteen tests passed. After the fix, the proposal retains Maya and automatic
acceptance creates a task waiting on Maya. A separate case retains no waiting-on party for I.

Two PostgreSQL contracts run the durable controller path with the same source sentence. They inspect
the stored proposal payload, acceptance status and created task row. They require CI because the
local Docker service is unavailable. Existing extraction, task edit/creation, proposal lifecycle,
transaction rollback, cancellation and duplicate-run tests are retained.

## Continuing task assessment

This is a targeted correction discovered during current-source reconciliation, not a completed
review of W09 or the task model. The Todo completion/status representation, the source-anchor range
shape, provider date narrowing, and remaining UI/export entry paths still need explicit dispositions.
The older assessment's A03 and A04 implementations remain on open PRs; their delivery has not merged.
