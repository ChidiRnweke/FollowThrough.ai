# Project section-numbering default review

W03.09 starts in the project page menu. Its three values mean on, off and use the app default.
sectionNumberingOverrideFor maps the inherit choice to absence. ProjectActions stages a
projectNumbering command through the project resource. A failed stage returns the store's explicit
error result; a successful local stage updates the shared record immediately and remains in the
outbox until acknowledged. This follows ADR 0040 rather than requiring a network write before display.

prepareWorkspaceCommand changes only the project default and update timestamp. The synchronized
Projects controller uses guarded mutation receipts around the write. ProjectCatalog requires an
active project owned by the actor. ProjectRecords also applies ownership and active-state predicates
at update time, writes SQL null for inheritance, and maps null back to absence. Explicit false survives
both mappings. These guards also apply to direct controller callers.

WorkspaceViews combines the current note, project and user-preference records through the shared
section-numbering service. A note override wins, then the project default, then the app default.
The documented product default is off when all three inherit. This is a preference default, not a
replacement for a failed resource read. The note workspace uses the effective value for the editor
counter class and outline numbering; its menu also shows the inherited value. Clearing a project
choice changes inheriting notes without overwriting an explicit note choice.

## Test disposition

Replace the controller-local InMemoryProjects service double with the real ProjectCatalog and the
existing InMemoryProjectRepository. Retain the on, inheritance and ownership cases, add explicit off
and archived-project refusal. Add SQL contracts for the same storage boundary, including a persisted
clear after an explicit false value. Add browser-command-to-WorkspaceViews composition cases for on,
off, inheritance and a note override. These observe the value consumed by the real note workspace.

Keep the shared cascade and menu-mapping tests: they cover distinct precedence and three-state
semantics. Keep the heading-sequence tests and existing note workspace checks; heading counters are a
separate rendering concern and are not rewritten by this review. No new production path, setting or
visual control is introduced. No database migration is needed. Local SQL execution remains unavailable;
the contract suite runs in CI.

W03.09 is assessed. Broader note-numbering editing, app preference editing and export typography retain
their own workflow reviews. The retained optional boolean is honest: absence means inheritance, while
true and false are both explicit choices.
