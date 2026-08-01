import type { MemoryEntry } from '$lib/models/memory';
import type { NoteSummary } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { Suggestion } from '$lib/models/suggestions';
import type { Todo } from '$lib/models/todos';
import type { User } from '$lib/models/identity';

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
	readonly id: string;
	readonly kind: string;
	readonly status: string;
	readonly confidence?: number;
	readonly payload: unknown;
	readonly createdAt: string;
}

export const projectSuggestion = (suggestion: Suggestion): SuggestionProjection => ({
	id: suggestion.id,
	kind: suggestion.kind,
	status: suggestion.status,
	...(suggestion.confidence === undefined ? {} : { confidence: suggestion.confidence }),
	payload: suggestion.payload,
	createdAt: suggestion.createdAt
});
