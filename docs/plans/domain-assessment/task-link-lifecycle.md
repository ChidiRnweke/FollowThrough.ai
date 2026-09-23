# Task links after note archival

W09.04–W09.06 edit a task independently of its selected note. A valid link can outlive note archival:
archiving the note preserves its row and the task's link. Previously TodoCatalog validated every
resolved link on every update. Completing or renaming such a task therefore failed with NOT_FOUND,
although the request did not change its link.

The controller now validates explicit non-null link assignments after locking the authoritative
task and before saving any edit. The service retains ownership, project, ordinary-note and active
state checks for that assignment. Unrelated edits preserve the existing link, and null still clears
it. Explicitly assigning the same archived note is still refused. Source-anchor and provenance checks
are unchanged. Browser preview and server persistence continue to use the shared task edit rule.

The service persistence method receives the resolved task; it no longer treats every saved task as
a request to establish a new link. The capability factory already supplies the same catalog, and the
public controller and sync commands do not change. No migration is required.

## Evidence

A controller regression first assigns a valid note, archives its fake record into a state that the
note archive workflow produces, then completes the task. It failed before the correction. Afterward,
focused regressions passed 17 files and 124 tests, including explicit archived-link refusal, foreign
ownership, another project, folders, nullable clears and completion transitions.

Four PostgreSQL contracts use the actual note archive controller and task controller. They cover
completion, text edits that preserve the link, atomic refusal of an explicit archived assignment,
and clearing the link. The note index collaborator is the existing in-memory fake; task and note
storage and transactions are real. Local PostgreSQL is unavailable, so CI must establish these
contract results. Full task and repository assessment coverage remains open.

The full local unit suite passed 443 files and 4,095 tests. Lint, type checks, architecture audits
and documentation checks passed.
