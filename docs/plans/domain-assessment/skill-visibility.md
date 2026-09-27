# Skill catalog and detail visibility

W12.05 begins in the skills catalog, a skill link, or the agent's list_skills/load_skill tools.
The catalog prepares workspace records and resolves its existing Inbox identity. WorkspaceViews.skills
joins metadata with active notes in active projects, including disabled skills so users can enable or
edit them. The row shows the current note title and description and links to the stable skill URL.
Project pin projection is reviewed separately. A missing Inbox is an explicit bootstrap error.

The detail route parses the ID and opens both note and metadata resources. Missing, deleted and
unavailable resources retain the shared route-access responses. The page joins the current local
records through WorkspaceViews.skill and mounts the editor only while that result exists. Previously
that join checked only metadata and note kind. A cached skill from an archived project still showed
its instructions and editing controls, even though it was absent from the catalog. Individually
archived skills and partial caches without the project had the same gap.

The detail projection now also requires an active note and a present, active project. It exposes the
page's existing unavailable state when those conditions fail. It does not discard local records or
outbox work, reinterpret disabled execution as archival, or change archive storage. This follows ADR
0009: the project archive hides its content without archiving each stored child.

Server listing still provisions built-ins before SkillLibrary lists the actor's catalog. SkillRecords
joins owned notes and active projects and excludes individually archived notes from the catalog.
Direct reading uses SkillLibrary.load; it rejects archived notes and cannot load through an archived
project. Read-only get combines the skill and usage view without creating usage. Agent load and usage
are covered in the separate usage review. Keep actor predicates at this storage boundary; the local
projection relies on the account-scoped workspace store rather than inventing another owner filter.

## Evidence and test disposition

Three new local projection cases failed before the fix: archived project, archived skill and missing
project. They pass after it; a fourth case preserves deliberate editing of a disabled skill. Existing
normalized note/skill views continue to pass. Add SQL contracts for archived-project catalog/detail
refusal, foreign-owner detail refusal and disabled-skill reading. Retain archived-note discovery and
usage contracts, pin projection tests and shared route-access status tests.

The browser reproduction mounts the actual skill route and editor with real WorkspaceResources and
seeded in-memory sync repositories. Its known project is archived. The before image exposes the
instruction body; the after image shows the existing unavailable message. The small project-state
label is fixture context. These captures verify the cached UI boundary, not live authentication or a
browser-to-PostgreSQL journey. No live model calls or private data are involved.

W12.05 is assessed. This fix covers skill detail visibility; it does not claim every note, diagram or
other project-child surface has completed the project archive review.
