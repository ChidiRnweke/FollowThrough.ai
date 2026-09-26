# Note reading presentation

## Owners and caller paths

Reading estimates, outline interpretation and section numbering are three focused shared services.
Their callers supply resolved text, heading positions and preferences; the services do not load
documents or settings. Models retain only OutlineHeading, OutlineOffset, OutlineSource and the
section-numbering value/view types. The old reading-time model held no domain type and is removed.

- NoteReadingStats and selection-chip construction use reading-time estimates and word counts.
  Empty text has zero words and reading time. Positive estimates round up at the existing 225-word
  rate. The count remains the documented whitespace-based estimate, not a tokenizer claim.
- NoteEditor supplies heading data and scroll-container offsets. The outline service omits blank
  or unidentified headings, clamps heading levels and selects the active heading. DOM acquisition,
  sticky-header geometry and scroll observation remain with the editor.
- Notes and WorkspaceViews both resolve the numbering view from note, project and app preferences.
  The shared service retains explicit false overrides and inheritance. Note/project menus use the
  same conversions, and the outline rail uses the existing authored-depth numbering sequence.

## Types and retained guarantees

An absent numbering preference means inherit; it is a meaningful domain value. The three preference
levels can vary independently. SectionNumberingView always carries its effective and inherited
values; its one optional noteOverride is absent only when the note inherits. OutlineSource permits a
missing identity because the editor can emit incomplete headings while an author types.

No default, heading bound, reading rate or rendered behavior changes. Browser and server numbering
continue to share one implementation. There is no second rule retained in a model or a component.

## Tests and scope

Move the reading-time, outline and section-numbering tests beside their service owners without
changing assertions. Retain workspace-view inheritance tests, server note views and mounted editor
coverage. The focused run passes 38 files and 289 tests. Full verification is recorded in the PR.

This records the presentation-rule portion of W07.01–W07.03, not a completed review of their
whole UI workflows. Component changes are imports only; no visible interface or CSS change is made.
