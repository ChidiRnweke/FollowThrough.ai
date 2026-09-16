# Skill display name

The Skills catalog uses the current note title after an offline rename. Both captures use the
real SkillCatalog component, WorkspaceViews, and application CSS at 1100 × 700 in the light theme.
The local skill note is named `Ship checklist`; the last synchronized metadata still says
`Release checklist`. The portable name is `release-checklist` in both states.

Before: the catalog shows the old synchronized name. After: it shows the local note title.

These are synthetic component captures. They verify the browser projection without a live agent
or a server write. PostgreSQL contracts separately verify atomic rename and synchronization.
