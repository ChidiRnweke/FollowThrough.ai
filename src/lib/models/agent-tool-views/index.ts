import type { BacklinkView } from '$lib/models/relationships';
import type { ReferenceView } from '$lib/models/references';
import type { Diagram } from '$lib/models/diagrams';
import type { TodoView } from '$lib/models/todos';
import type { SuggestionView } from '$lib/models/suggestions';
import type { NoteView } from '$lib/models/notes';
import type { Suggestion } from '$lib/models/suggestions';
import type { AgentFileMetadata } from '$lib/models/agent-files';

export interface MemoryProjection {
	readonly id: string;
	readonly content: string;
	readonly projectId?: string;
	readonly createdAt: string;
}

export interface ProjectProjection {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
}

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
 * What a note write leaves behind: the id it can be reached by, and the facts
 * that changed. Nothing else.
 *
 * The same argument as the note-summary projection, applied to the write path,
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

/** The same, for a todo write. `todoId` for the same reason `noteId` is. */
export interface TodoWriteProjection {
	readonly todoId: string;
	readonly title: string;
	readonly status: string;
}

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

export interface UserProjection {
	readonly displayName: string;
	readonly email: string;
}

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

export interface NoteViewProjection {
	readonly noteId: string;
	readonly title: string;
	/** The authoritative Markdown is a file, not an unbounded tool-result field. */
	readonly body: { readonly kind: 'file'; readonly file: AgentFileMetadata };
	/** Kept because publish_note requires the base ETag. */
	readonly etag: string;
	backlinks: ResolvedNoteView['backlinks'];
	references: ResolvedNoteView['references'];
	diagrams: ResolvedNoteView['diagrams'];
	todos: ResolvedNoteView['todos'];
	pendingSuggestions: ResolvedNoteView['pendingSuggestions'];
}

export interface SkillViewProjection {
	readonly noteId: string;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	/** The skill body as Markdown — the same text edit_skill patches and save_skill replaces. */
	readonly instructions: string;
}

export type ResolvedNoteView = NoteView<
	BacklinkView,
	ReferenceView,
	Diagram,
	TodoView,
	SuggestionView
>;
