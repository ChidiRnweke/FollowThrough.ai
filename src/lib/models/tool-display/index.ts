import { z } from 'zod';

export type EntityKind =
	| 'note'
	| 'folder'
	| 'attachment'
	| 'todo'
	| 'project'
	| 'skill'
	| 'diagram'
	| 'artifact'
	| 'memory'
	| 'suggestion'
	| 'setting'
	/** Something worth naming that has nowhere to be opened — a model, a template, a token. */
	| 'plain';

export interface EntityRef {
	readonly kind: EntityKind;
	/** Set only when the thing can actually be opened. */
	readonly id?: string;
	readonly title: string;
	/** False when `title` is a stand-in, so a caller can try to resolve the real one. */
	readonly named: boolean;
	readonly destination?:
		| { readonly kind: 'page'; readonly href: string; readonly label: string }
		| { readonly kind: 'download'; readonly artifactId: string }
		| { readonly kind: 'note'; readonly noteId: string };
}

export interface ToolResultFields {
	readonly noteId?: string;
	readonly attachmentId?: string;
	readonly skillNoteId?: string;
	readonly sourceNoteId?: string;
	readonly fileName?: string;
	readonly filename?: string;
	readonly label?: string;
	readonly kind?: string;
	readonly status?: string;
	readonly path?: string;
	readonly toolName?: string;
	readonly pipeline?: string;
	readonly operation?: string;

	readonly todoId?: string;
	readonly diagramId?: string;
	readonly projectId?: string;
	readonly entryId?: string;
	readonly artifactId?: string;
	readonly suggestionId?: string;
	readonly id?: string;
	readonly title?: string;
	readonly name?: string;
	readonly content?: string;
	/** `edit_note` and `save_note` answer with the revision they wrote. */
	readonly currentRevision?: number;
}

/** Blank is absent. A row titled `""` is a row with no title, not a row named nothing. */
const label = z
	.string()
	.transform((value) => value.trim())
	.refine((value) => value.length > 0)
	.optional()
	.catch(undefined);

const revision = z.number().int().nonnegative().optional().catch(undefined);

/**
 * `.catch(undefined)` per field rather than a `safeParse` over the whole object.
 * A result carrying `{ noteId: 'abc', title: 42 }` still names a note; failing
 * the object whole would drop the id because a different field was the wrong
 * type, which is a worse answer than the one the reader asked for.
 */
export const toolResultFieldsSchema = z.object({
	noteId: label,
	attachmentId: label,
	skillNoteId: label,
	sourceNoteId: label,
	fileName: label,
	filename: label,
	label: label,
	kind: label,
	status: label,
	path: label,
	toolName: label,
	pipeline: label,
	operation: label,

	todoId: label,
	diagramId: label,
	projectId: label,
	entryId: label,
	artifactId: label,
	suggestionId: label,
	id: label,
	title: label,
	name: label,
	content: label,
	currentRevision: revision
});
