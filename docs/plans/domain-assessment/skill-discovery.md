# Skill discovery and explicit loading

W12.15 starts when Agent freezes a submitted request. Explicit names and note IDs travel with the
request. A diagram-studio surface adds its declared built-in skill name; an ordinary chat surface
does not. Run preparation ensures built-ins, reads enabled owned skills through SkillLibrary and
SkillRecords, then stores the prepared context before execution. Resumption keeps that snapshot.
The catalog spans owned active projects; the current project selects pin state, not ownership scope.
Archived notes and archived projects are absent from discovery. Disabled skills are absent from the
automatic catalog even when named explicitly.

AgentContext matches explicit requests by note ID, case-insensitive display name or portable slug.
An opted-out skill needs one of these requests. Pinning changes priority but does not override that
opt-out. Requested skills lead, followed by project pins and then alphabetical summaries. Instructions
are not injected at this stage. The model chooses which descriptions apply and invokes load_skill.

The existing 16,000-character JSON budget can omit ordinary summaries, but never requested or pinned
ones. It is a prompt presentation budget, not a database read limit: list_skills returns the full owned
active catalog, including disabled entries with their state. The July 26 provisioning/selection change
(1d626325) introduced this policy in place of keyword relevance selection. Its rationale calls the
budget a safety valve; no measured threshold justification was found. Retain the existing threshold
in this repair. Reconsider its value with prompt-size measurements rather than silently treating it as
an established optimal limit.

Two prompt defects broke this contract. The prompt called a truncated catalog complete. If every
summary exceeded the budget, it omitted the entire skills section and its fallback discovery hint.
Render the section for either advertised entries or known truncation, describe it as the summaries
advertised for this run, and keep the list_skills hint. This also avoids calling an opt-out-filtered
catalog complete. Summary text stays JSON-escaped and explicitly untrusted.

The read tool reaches Skills.list and built-in provisioning. Explicit load_skill reaches the
transactional Skills.loadForAgent, validates ownership and active visibility, records provenance and
optional owned context, and returns the current instruction body and history. A disabled skill is
still deliberately loadable: enablement controls automatic advertising, not access authorization.
The browser's detail read does not count as use. See [load and usage review](skill-loads.md) for rollback
and foreign-context coverage. Do not merge enablement, project pins, note pins and usage into one state.

## Evidence and test disposition

Two prompt regressions failed against the old rendering and pass after the fix. They compose real
AgentContext formatting with the actual runner instruction builder. Keep the escaping check and
explicit slug/ID, opt-out pin, and disabled-request cases. Retain the executable Agent context suite
for summary-only input, cross-project availability, requested/pinned priority and overflow; retain
submission tests for surface-request freezing. Add a PostgreSQL case joining disabled discovery,
explicit load and recorded provenance. Existing archive/ownership, project-pin and transactional load
contracts remain necessary. No live model invocation is claimed.

W12.15 is assessed. The portable-name provisioning collision in W12.01 and restoration policy D03
remain open; this change does not settle them.
