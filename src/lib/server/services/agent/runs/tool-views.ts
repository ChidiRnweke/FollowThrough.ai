import type { MemoryEntry } from '$lib/models/memory';
import type { Note, NoteRevision, NoteSummary, NoteView } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
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

export interface MemoryProjection {
	readonly id: string;
	readonly content: string;
	readonly projectId?: string;
	readonly createdAt: string;
}

export const projectMemory = (entry: MemoryEntry): MemoryProjection => ({
	id: entry.id,
	content: entry.content,
	// Only meaningful when listing across scopes; user-scope entries omit it.
	...(entry.projectId ? { projectId: entry.projectId } : {}),
	createdAt: entry.createdAt
});

export interface ProjectProjection {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
}

export const projectProject = (project: Project): ProjectProjection => ({
	id: project.id,
	name: project.name,
	createdAt: project.createdAt
});

export interface NoteSummaryProjection {
	readonly id: string;
	readonly title: string;
	readonly kind: string;
	readonly projectId: string;
	readonly parentId?: string;
	readonly isPinned?: true;
	readonly createdAt: string;
}

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
export const projectNoteSummary = (note: NoteSummary): NoteSummaryProjection => ({
	id: note.id,
	title: note.title,
	kind: note.kind,
	projectId: note.projectId,
	...(note.parentId ? { parentId: note.parentId } : {}),
	...(note.isPinned ? { isPinned: true as const } : {}),
	createdAt: note.createdAt
});

/**
 * What a note write leaves behind: the id it can be reached by, and the facts
 * that changed. Nothing else.
 *
 * The same argument as {@link projectNoteSummary}, applied to the write path,
 * which never got it. `create_note` and friends returned `{ note: Note }`
 * straight from the controller, so every mutation shipped the whole
 * ProseMirror `document` and its `plainText` twin — and the replay virtualizer
 * cannot save us here, because it sinks *strings* over a threshold and a
 * document is an object of many small ones. It rode in replayed history on
 * every subsequent turn of the conversation.
 *
 * `noteId` rather than `id` on purpose: it is the name the note tools take as
 * an argument, and the name the transcript looks for when it turns a result
 * into something the reader can open.
 *
 * These three fields and no more: `save_note` already returned exactly this
 * receipt by hand, and the choice was deliberate. This makes it a name the
 * other nine writes can share rather than a new, wider shape.
 */
export interface NoteWriteProjection {
	readonly noteId: string;
	readonly title: string;
	readonly currentRevision: number;
}

export const projectNoteWrite = (
	note: Pick<Note, 'id' | 'title' | 'currentRevision'>
): NoteWriteProjection => ({
	noteId: note.id,
	title: note.title,
	currentRevision: note.currentRevision
});

/** The same, for a todo write. `todoId` for the same reason `noteId` is. */
export interface TodoWriteProjection {
	readonly todoId: string;
	readonly title: string;
	readonly status: string;
}

export const projectTodoWrite = (todo: Todo): TodoWriteProjection => ({
	todoId: todo.id,
	title: todo.title,
	status: todo.status
});

/**
 * A revision in a history listing. `revisionId` is kept because
 * `restore_note_version` takes it; the snapshot's own `document` and
 * `plainText` are not — a history listing is for choosing which revision to
 * read, and reading one is a separate call.
 */
export interface NoteRevisionProjection {
	readonly revisionId: string;
	readonly noteId: string;
	readonly revision: number;
	readonly title: string;
	readonly createdAt: string;
}

export const projectNoteRevision = (revision: NoteRevision): NoteRevisionProjection => ({
	revisionId: revision.id,
	noteId: revision.noteId,
	revision: revision.revision,
	title: revision.title,
	createdAt: revision.createdAt
});

export interface TodoProjection {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly responsibility: string;
	readonly description?: string;
	readonly waitingOn?: string;
	readonly dueDate?: string;
	readonly projectId: string;
	readonly linkedNoteId?: string;
	readonly createdAt: string;
}

export const projectTodo = (todo: Todo): TodoProjection => ({
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
});

export interface UserProjection {
	readonly displayName: string;
	readonly email: string;
}

/** The agent never addresses the user by id, only refers to them. */
export const projectUser = (user: User): UserProjection => ({
	displayName: user.displayName,
	email: user.email
});

export interface SuggestionProjection {
	readonly noteId?: string;
	readonly id: string;
	readonly kind: string;
	readonly status: string;
	readonly confidence?: number;
	/**
	 * The domain payload, which is already a union discriminated by `kind`. It
	 * was `unknown`, so the one field of a suggestion that says what the
	 * suggestion is arrived at the model's tool result with nothing said about it.
	 */
	readonly payload: Suggestion['payload'];
	readonly createdAt: string;
}

export const projectSuggestion = (suggestion: Suggestion): SuggestionProjection => ({
	...(suggestion.noteId ? { noteId: suggestion.noteId } : {}),
	id: suggestion.id,
	kind: suggestion.kind,
	status: suggestion.status,
	...(suggestion.confidence === undefined ? {} : { confidence: suggestion.confidence }),
	payload: suggestion.payload,
	createdAt: suggestion.createdAt
});

export interface NoteViewProjection {
	readonly noteId: string;
	readonly title: string;
	/** The authoritative Markdown is a file, not an unbounded tool-result field. */
	readonly body: { readonly kind: 'file'; readonly file: AgentFileMetadata };
	/** Kept because publish_note requires the base ETag. */
	readonly etag: string;
	backlinks: NoteView['backlinks'];
	references: NoteView['references'];
	diagrams: NoteView['diagrams'];
	todos: NoteView['todos'];
	pendingSuggestions: NoteView['pendingSuggestions'];
}

/**
 * The agent's read surface for a note. Its body points at the same Markdown the
 * write tools anchor against; the ProseMirror `document` and the redundant
 * `plainText` are storage formats the model never uses, so they stay off the
 * wire. Constructed explicitly (see {@link projectNoteSummary}) so the
 * declared shape is true on the wire.
 */
export const projectNoteView = (view: NoteView, file: AgentFileMetadata): NoteViewProjection => ({
	noteId: view.note.id,
	title: view.note.title,
	body: { kind: 'file', file },
	etag: view.etag,
	backlinks: view.backlinks,
	references: view.references,
	diagrams: view.diagrams,
	todos: view.todos,
	pendingSuggestions: view.pendingSuggestions
});

export interface SkillViewProjection {
	readonly noteId: string;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	/** The skill body as Markdown — the same text edit_skill patches and save_skill replaces. */
	readonly instructions: string;
}

/**
 * The agent's read surface for a skill. The body is Markdown, matching the
 * write tools' anchor text; `isEnabled` already filtered the finder, so it is
 * never returned. The underlying `note` (ProseMirror `document`, revisions)
 * and `usages` telemetry stay off the wire.
 */
export const projectSkillView = (view: SkillView, instructions: string): SkillViewProjection => ({
	noteId: view.skill.note.id,
	name: view.skill.name,
	description: view.skill.description,
	triggerHints: view.skill.triggerHints,
	instructions
});
