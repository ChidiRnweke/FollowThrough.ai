import { NotFoundError } from '$lib/errors';
import type { MemoryEntry } from '$lib/models/memory';
import type { NoteDocumentFile } from '$lib/server/controllers/notes/controller';
import type { SkillInstructions } from '$lib/server/controllers/skills/controller';
import type { Note, NoteId, NoteRevision, NoteSummary } from '$lib/models/notes';
import type { Project, ProjectId } from '$lib/models/projects';
import type { SkillView } from '$lib/models/skills';
import type { Suggestion } from '$lib/models/suggestions';
import type { Todo } from '$lib/models/todos';
import type { User } from '$lib/models/identity';
import type { AgentFileMetadata } from '$lib/models/agent-files';

/**
 * Agent-facing projections of domain models.
 *
 * Controllers return DTOs shaped for the UI, which carries fields the model can
 * never use: `userId` is always the acting user, audit timestamps are noise, and
 * internal foreign keys (`provenanceId`, `replacesEntryId`) name rows the agent
 * cannot address. Every one of those tokens is paid for on each call and dilutes
 * the fields that do matter.
 *
 * Two rules decide what survives:
 *  - Keep an `id` whenever the agent can act on the thing later; drop ids it can
 *    only echo back.
 *  - Keep a timestamp only where it carries meaning the agent reasons about
 *    (a due date), never as provenance.
 *
 * These are applied at the tool boundary only. Controllers and the UI are
 * untouched, so slimming a tool cannot change what the app renders.
 */

import type {
	MemoryProjection,
	ProjectProjection,
	NoteSummaryProjection,
	NoteWriteProjection,
	TodoWriteProjection,
	NoteRevisionProjection,
	TodoProjection,
	UserProjection,
	SuggestionProjection,
	NoteViewProjection,
	SkillViewProjection,
	ResolvedNoteView
} from '$lib/models/agent-tool-views';

export const projectMemory = (entry: MemoryEntry): MemoryProjection => {
	return {
		id: entry.id,
		content: entry.content,
		// Only meaningful when listing across scopes; user-scope entries omit it.
		...(entry.projectId ? { projectId: entry.projectId } : {}),
		createdAt: entry.createdAt
	};
};
export const projectProject = (project: Project): ProjectProjection => {
	return {
		id: project.id,
		name: project.name,
		createdAt: project.createdAt
	};
};
/**
 * Structure only. The tree is for navigation — the agent picks an id and calls
 * `get_note` for content.
 *
 * Worth stating plainly: the declared type here is already `NoteSummary`, a
 * `Pick<Note, …>` that excludes `document` and `plainText`. The repository still
 * returns whole rows, and TypeScript only narrows the static type — it does not
 * strip fields at runtime, and `JSON.stringify` serialises whatever is actually
 * there. So every note body was being shipped twice on every call despite a type
 * that said otherwise. Constructing the object explicitly is what makes the
 * declared shape true on the wire.
 */

export const projectNoteSummary = (note: NoteSummary): NoteSummaryProjection => {
	return {
		id: note.id,
		title: note.title,
		kind: note.kind,
		projectId: note.projectId,
		...(note.parentId ? { parentId: note.parentId } : {}),
		...(note.isPinned ? { isPinned: true as const } : {}),
		createdAt: note.createdAt
	};
};
export const projectNoteWrite = (
	note: Pick<Note, 'id' | 'title' | 'currentRevision'>
): NoteWriteProjection => {
	return {
		noteId: note.id,
		title: note.title,
		currentRevision: note.currentRevision
	};
};
export const projectTodoWrite = (todo: Todo): TodoWriteProjection => {
	return {
		todoId: todo.id,
		title: todo.title,
		status: todo.status
	};
};
export const projectNoteRevision = (revision: NoteRevision): NoteRevisionProjection => {
	return {
		revisionId: revision.id,
		noteId: revision.noteId,
		revision: revision.revision,
		title: revision.title,
		createdAt: revision.createdAt
	};
};
export const projectTodo = (todo: Todo): TodoProjection => {
	return {
		id: todo.id,
		title: todo.title,
		status: todo.status,
		// Whether this is the user's own commitment or one they are waiting on is
		// exactly the distinction the agent is asked about; it stays.
		responsibility: todo.responsibility,
		...(todo.description ? { description: todo.description } : {}),
		...(todo.waitingOn ? { waitingOn: todo.waitingOn } : {}),
		// A due date is something the agent reasons about; audit stamps are not.
		...(todo.dueDate ? { dueDate: todo.dueDate } : {}),
		projectId: todo.projectId,
		...(todo.linkedNoteId ? { linkedNoteId: todo.linkedNoteId } : {}),
		createdAt: todo.createdAt
	};
};
/** The agent never addresses the user by id, only refers to them. */

export const projectUser = (user: User): UserProjection => {
	return {
		displayName: user.displayName,
		email: user.email
	};
};
export const projectSuggestion = (suggestion: Suggestion): SuggestionProjection => {
	return {
		...(suggestion.noteId ? { noteId: suggestion.noteId } : {}),
		id: suggestion.id,
		kind: suggestion.kind,
		status: suggestion.status,
		...(suggestion.confidence === undefined ? {} : { confidence: suggestion.confidence }),
		payload: suggestion.payload,
		createdAt: suggestion.createdAt
	};
};
/**
 * The agent's read surface for a note. Its body points at the same Markdown the
 * write tools anchor against; the ProseMirror `document` and the redundant
 * `plainText` are storage formats the model never uses, so they stay off the
 * wire. Constructed explicitly (see {@link projectNoteSummary}) so the
 * declared shape is true on the wire.
 */

export const projectNoteView = (
	view: ResolvedNoteView,
	file: AgentFileMetadata
): NoteViewProjection => {
	return {
		noteId: view.note.id,
		title: view.note.title,
		body: { kind: 'file', file },
		etag: view.etag,
		backlinks: view.backlinks,
		references: view.references,
		diagrams: view.diagrams,
		todos: view.todos,
		pendingSuggestions: view.pendingSuggestions
	};
};
/**
 * The agent's read surface for a skill. The body is Markdown, matching the
 * write tools' anchor text; `isEnabled` already filtered the finder, so it is
 * never returned. The underlying `note` (ProseMirror `document`, revisions)
 * and `usages` telemetry stay off the wire.
 */

export const projectSkillView = (
	view: SkillView<Note>,
	instructions: string
): SkillViewProjection => {
	return {
		noteId: view.skill.note.id,
		name: view.skill.note.title,
		description: view.skill.description,
		triggerHints: view.skill.triggerHints,
		instructions
	};
};

/** The workspace at a glance: structure only, because the agent calls get_note for content. */
export const workspaceContext = <Skills>(shell: {
	readonly user: User;
	readonly projects: readonly Project[];
	readonly noteTree: readonly NoteSummary[];
	readonly skills: Skills;
	readonly pendingSuggestionCount: number;
}) => ({
	user: projectUser(shell.user),
	projects: shell.projects.map(projectProject),
	noteTree: shell.noteTree.map(projectNoteSummary),
	skills: shell.skills,
	pendingSuggestionCount: shell.pendingSuggestionCount
});

export const noteView = (read: NoteDocumentFile): NoteViewProjection =>
	projectNoteView(read.view, read.file);

/**
 * A written note with its ETag. The ETag survives the projection: publish_note takes it as an
 * argument, and restoring a version is the step most likely to be followed by publishing it.
 */
export const writtenWithEtag = (written: {
	readonly note: Pick<Note, 'id' | 'title' | 'currentRevision'>;
	readonly etag: string;
}) => ({ ...projectNoteWrite(written.note), etag: written.etag });

export const skillView = (loaded: SkillInstructions): SkillViewProjection =>
	projectSkillView(loaded.view, loaded.instructions);

/** A project diagram as the virtual file the agent reads its source from. */
export const diagramFile = <Labels>(diagram: {
	readonly id: string;
	readonly kind: 'mermaid' | 'drawio';
	readonly title?: string;
	readonly labels: Labels;
	readonly projectId: string;
}) => ({
	id: diagram.id,
	kind: diagram.kind,
	...(diagram.title ? { title: diagram.title } : {}),
	labels: diagram.labels,
	path: `/projects/${diagram.projectId}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`
});

export const revokedToken = (token: { readonly id: string; readonly name: string }) => ({
	tokenId: token.id,
	name: token.name,
	revoked: true as const
});

export const foundArtifact = <Artifact>(artifact: Artifact | undefined): Artifact => {
	if (artifact === undefined) throw new NotFoundError('Artifact not found');
	return artifact;
};

export const deletedArtifact = (artifact: { readonly id: string; readonly title: string }) => ({
	artifactId: artifact.id,
	title: artifact.title,
	deleted: true as const
});

export const exportSettings = <Input extends { readonly projectId: ProjectId }>(
	input: Input
): Omit<Input, 'projectId'> => {
	const { projectId: _projectId, ...settings } = input;
	return settings;
};

/**
 * Creating saves the widget in the project; only a reviewed note edit shows it in a note
 * (ADR 0003), so the result names that edit rather than performing it.
 */
export const createdWidget = (
	widget: { readonly id: string; readonly title: string },
	noteId: NoteId | undefined
) => {
	// Single quotes parse the same as double ones, and need no escaping inside the JSON
	// arguments of the edit_note call that inserts the line. An unescaped double quote
	// there fails the whole run as malformed tool arguments.
	const embed = `:::widgetNode {widgetId='${widget.id}'} :::`;
	return {
		widgetId: widget.id,
		title: widget.title,
		embed,
		nextActions: [
			noteId
				? {
						tool: 'edit_note' as const,
						noteId,
						reason: `The widget is not in the note yet. Call edit_note on note ${noteId} now and insert ${embed} on its own line where the user asked for it.`
					}
				: {
						tool: 'edit_note' as const,
						reason:
							'If the user asked for the widget in a note, insert the embed line on its own line in that note before you finish.'
					}
		]
	};
};
