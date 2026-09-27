# Cached diagram opens after project archive

ADR 0009 hides a project's children as one unit. WorkspaceViews.diagram previously returned its
cached diagram regardless of project state. DiagramPane could also fall back to its downloaded draft
when the normal projection was absent, so changing the shared read alone would not guard the editor.

Hide the detail projection when the known project is archived. The pane checks that same known
project boundary before opening its first canvas or preview. A fresh archived-project open displays
an unavailable notice and does not expose the title, preview or embedded editor. Raw cached records
remain intact. Missing project metadata keeps its existing separate behavior; this change does not
pretend that a partially downloaded graph proves a project active or archived.

Once a canvas has opened, keep it mounted when its project becomes archived. Show an explicit archive
warning so the user can preserve work. Do not reset its iframe, editor generation or captured draft.
This is a recovery surface, not permission for the server to accept writes to archived projects. The
ordinary editor and outbox still report their write failures. Closing and reopening goes through the
new guard. The same pane serves both direct diagram routes and workbench tabs.

## Evidence and test disposition

The archived-project detail regression failed before the fix. It passes alongside cases preserving
the raw diagram and exposing it when the project is active. Retain the existing embed-adapter tests
for message origin/source checks and edit/export/retry behavior.

A seeded browser check used the actual DiagramPane and real WorkspaceResources with an in-memory
transport. A cached Mermaid diagram in an archived project displayed its title and preview before;
after, the fresh open showed only the unavailable state. Matched captures record that change.

A separate browser case mounted the actual DrawioEmbed host, substituting a small iframe protocol
fixture for the external draw.io page. The fixture sent valid init/load/modified events and held a
text buffer. After project archive arrived through the workspace transport, the same iframe element
and its buffer remained mounted, with the archive warning. This verifies host retention, not the live
vendor editor or live database persistence. Temporary session and surface substitutions were removed.

W03.03 remains open for the complete set of project child read/write paths, including cross-project
relationship presentation. Individual diagram trash/restore policy remains in its own workflow.
