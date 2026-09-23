# Skill pin ownership and catalog scope

W12.12 changes a pin for one project. The accepted skills subsystem policy already describes
project-specific pins. A note's independent workspace pin is not that pin. Skills remain available
across the actor's active projects; their storage project does not restrict the advertised catalog.

Skills.setPinned now owns a transaction. SkillPins validates and locks both active projects in ID
order, then the active skill note and its metadata. It rejects foreign or archived projects and
archived skill notes. It rejects a source-project change discovered after waiting. Persistence
receives the resolved pin and retains idempotent insertion and deletion.

Project writes use FOR NO KEY UPDATE. This still serializes project writers, but permits the
foreign-key checks that note indexing performs while holding a note lock. FOR UPDATE could let
a pin writer hold a project and wait for a note while that note's index writer waits for the project.
See PostgreSQL's [row-lock compatibility rules](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
Project IDs are not rewritten by these workflows. No migration is required.

For W12.05, SkillSummary requires the source project ID and the resolved pin boolean. The global
catalog has no project pin context and returns false. A selected project joins its own pins without
excluding skills stored in other active projects. WorkspaceViews now follows that same rule.
The repository and agent fakes retain pins by project rather than by note alone.

## Evidence and limits

Three workspace tests cover global, selected-project and unrelated-project projections. Two failed
against the previous projection and all three pass after the change. Six controller tests cover
idempotence, independent pins and lifecycle guards. Five PostgreSQL contracts cover stored scope,
archive races, provisioning and the note-indexing lock cycle. Contract execution requires CI because
the local Docker service is unavailable; do not treat their presence as an observed pass.

The committed before/after images render the real SkillCatalog with WorkspaceViews and application
CSS through the surface fixture route. Both use a 1200 by 600 light viewport and a 1080-pixel content
region. Seed an active Inbox project and an enabled skill titled Release checklist with description
Check the release notes and verify the build., trigger hint release, a pinned source note, and no
project_skill_pins. Render views.skills() inside the tooltip provider. The before image shows a pin
beside the title; the after image does not. The temporary fixture was removed after capture.
The authenticated app was unavailable locally, so this is seeded component evidence, not an
authenticated end-to-end run. No database fixture was created for the screenshots.

Usage workflows, prepared edit payloads, portable-name concurrency and broader catalog ordering
still need separate dispositions. This closes neither the skill namespace nor the whole assessment.
