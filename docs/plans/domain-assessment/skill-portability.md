# Skill import and export

W12.06 starts with a SKILL.md file selected in the skill editor. The editor first saves current buffers
and refuses import while they remain dirty or unsynchronized. It captures the editing checkpoint
before reading the file, so intervening typing stops the import. The remote command parses the YAML
frontmatter and Markdown at the boundary, then passes a narrow manifest and observed base revision to
Skills.update. Invalid files receive an explicit error and do not become a skill update.

The manifest boundary requires a portable lowercase name and a nonempty description. It retains
license, compatibility and author metadata, removes the reserved invocation-policy key from ordinary
metadata, and resolves that policy as a boolean. It accepts Windows line endings and trims only the
portable body's trailing whitespace. Missing delimiters, malformed YAML and invalid metadata fail.
Parsing stays outside the controller and services, as required by ADR 0037.

Skills.update owns the transaction and catalog lock. It reads the current owned skill under note and
metadata locks, applies metadata decisions, validates the complete portable value, and refuses a
stale different body. An identical retry remains a no-op. Import replaces portable fields, including
clearing omitted license and compatibility, while preserving local enabled state and note identity.
A portable name does not rename the note's display title. The candidate body, metadata, links and
indexing commit together. Duplicate-name races and failed writes retain the existing skill. Keep the
locking and immutable-base checks reviewed in skill-edits and skill-name-transactions.

After a successful import the editor refreshes the workspace and reopens note and metadata drafts.
A superseded checkpoint retains later typing and reports that it needs review. A reopen failure is
reported explicitly rather than presenting the old local body as the imported result. The server may
already have committed in that case; the error must not imply that the server rolled back.

W12.07 exports the current editor's synchronized local body through serializeSkillManifest. The
shared serializer validates portable metadata, emits YAML and instructions, and records an explicit
false invocation policy under its reserved key. The browser downloads a Markdown Blob named after
the portable slug and revokes its object URL. Enabled state, usage records and project pins are local
application facts and do not enter SKILL.md. The serializer remains shared with other callers; it is
not replaced by another endpoint or a second format implementation.

## Removed paths and retained verification

Remove the unused Skills.serialize controller method, its surface/agent-map entries and the
SkillEditor.manifest read used only by that method. Browser export already calls the shared serializer
directly; agent load already returns the skill. Remove saveSkillDraft, whose last caller was the old
two-command creation wizard replaced in PR #241. Ordinary editor saves use workspace note/metadata
commands, imports retain importSkillMarkdown, and reviewed agent body changes retain their existing
controller paths. No caller or wire format changes are required.

Retain portable validation, parser round-trip and malformed-input cases. Adapt the generated-name
export test to read the skill and use the actual shared export shape. Add a PostgreSQL round trip
through import parsing, controller update, stored detail and serialization, including optional fields,
author metadata, invocation policy, stable identity and disabled-state preservation. Existing
contracts cover omitted-field clearing, actor boundaries, stale edits and duplicate-name races.

A seeded browser check exercised the real skill editor's download button and inspected the produced
reviewing-changes.skill.md. It retained the instructions, license, compatibility, owner metadata and
explicit invocation policy. It used real WorkspaceResources with in-memory sync storage; it does not
claim a live import journey or authenticated PostgreSQL browser session. No visible UI changes are
part of this removal.

W12.06 and W12.07 are assessed. Autosave conflict behavior, targeted agent edits and restoration
history remain separate workflows.
