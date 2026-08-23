import { z } from 'zod';
import { redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { ExtractPromisesInput } from '$lib/models/todos';
import type {
	ConvertInlineMermaidInput,
	GenerateMermaidDiagramInput,
	ReviseInlineMermaidInput
} from '$lib/models/diagrams';
import type {
	GetNoteRevisionInput,
	ListNoteSyncInventoryInput,
	PublishNoteInput,
	DiscardNoteDraftInput,
	RestoreNoteRevisionInput,
	SearchNoteTextInput,
	ReplaceNoteTextInput,
	SetNoteSectionNumberingInput,
	SyncNoteInput
} from '$lib/models/notes';
import { MAX_NOTE_DOCUMENTS } from '$lib/models/notes';
import type { RelateSelectionInput } from '$lib/models/relationships';
import type { NoteId } from '$lib/models/notes';
import type { UserId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';

const noteId = z.string().uuid().transform((value) => value as NoteId);
const userId = z.string().uuid().transform((value) => value as UserId);
const projectId = z.string().uuid().transform((value) => value as ProjectId);
const dateTime = z.string().datetime().transform((value) => value as DateTime);

const noteSchema = z.object({
	id: noteId,
	userId,
	projectId,
	parentId: noteId.optional(),
	kind: z.enum(['folder', 'note', 'skill']),
	position: z.number().int(),
	title: z.string(),
	document: z.object({
		type: z.literal('doc'),
		content: z.array(z.record(z.string(), z.unknown())).readonly().optional()
	}),
	plainText: z.string(),
	currentRevision: z.number().int(),
	publishedRevision: z.number().int().default(0),
	isPinned: z.boolean(),
	sectionNumbering: z.boolean().optional(),
	publishedAt: dateTime.optional(),
	archivedAt: dateTime.optional(),
	createdAt: dateTime,
	updatedAt: dateTime
});

const textSelection = z
	.object({
		noteId,
		revision: z.number().int().positive(),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		text: z.string()
	})
	.refine((s) => s.to >= s.from, 'Selection end must follow its start.');

const noteEtag = z.string().regex(/^note:[0-9a-f-]+:r[1-9][0-9]*$/i);

export const saveNote = command(z.object({ note: noteSchema }), async (input) => {
	return AppFactory.controllers()
		.notes()
		.save(requestActor(), input);
});

export const getNote = query(z.string().uuid(), async (noteId) => {
	const view = await AppFactory.controllers()
		.notes()
		.get(requestActor(), { noteId: noteId as NoteId });
	return view.note;
});

export const listNoteDocuments = query(
	z.array(z.string().uuid()).min(1).max(MAX_NOTE_DOCUMENTS),
	async (noteIds) =>
		AppFactory.controllers()
			.notes()
			.listDocuments(requestActor(), { noteIds: noteIds as NoteId[] })
);

export const getNoteView = query(z.string().uuid(), async (noteId) => {
	return AppFactory.controllers()
		.notes()
		.get(requestActor(), { noteId: noteId as NoteId });
});

export const syncNote = command(
	z.object({
		note: noteSchema,
		baseEtag: noteEtag,
		operationId: z.string().uuid()
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.sync(requestActor(), input as SyncNoteInput);
	}
);

export const publishNote = command(
	z.object({
		noteId: z.string().uuid(),
		baseEtag: noteEtag
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.publish(requestActor(), input as PublishNoteInput);
	}
);

export const discardNoteDraft = command(
	z.object({
		noteId: z.string().uuid()
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.discardDraft(requestActor(), input as DiscardNoteDraftInput);
	}
);

export const setNoteSectionNumbering = command(
	z.object({
		noteId: z.string().uuid(),
		// Omitted (not false) clears the override so the note inherits again.
		enabled: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.setSectionNumbering(requestActor(), input as SetNoteSectionNumberingInput);
	}
);

export const listNoteRevisions = query(z.string().uuid(), async (noteId) => {
	return AppFactory.controllers()
		.notes()
		.listRevisions(requestActor(), { noteId: noteId as NoteId });
});

export const getNoteRevision = query(
	z.object({ noteId: z.string().uuid(), revisionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.getRevision(requestActor(), input as GetNoteRevisionInput);
	}
);

export const restoreNoteRevision = command(
	z.object({ noteId: z.string().uuid(), revisionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.restoreRevision(requestActor(), input as RestoreNoteRevisionInput);
	}
);

export const listNoteSyncInventory = query(
	z.object({ projectId: z.string().uuid().optional() }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.listSyncInventory(requestActor(), input as ListNoteSyncInventoryInput);
	}
);

const noteSearchSchema = z.object({
	query: z.string().min(1).max(500),
	regex: z.boolean(),
	caseSensitive: z.boolean(),
	projectId: z.string().uuid().optional()
});

export const searchNotes = query(noteSearchSchema, async (input) => {
	return AppFactory.controllers()
		.notes()
		.searchText(requestActor(), input as SearchNoteTextInput);
});

export const replaceInNotes = command(
	noteSearchSchema.extend({
		replacement: z.string().max(2000),
		noteIds: z.array(z.string().uuid()).min(1).max(200).optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.replaceText(requestActor(), input as ReplaceNoteTextInput);
	}
);

export const extractPromises = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllers()
		.todos()
		.startExtractPromises(requestActor(), input as ExtractPromisesInput);
});

export const relateNote = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllers()
		.relationships()
		.startSuggestFromSelection(requestActor(), input as RelateSelectionInput);
});

export const findReferences = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllers()
		.references()
		.startSuggestFromSelection(requestActor(), input);
});

export const generateDiagram = command(
	z.object({ selection: textSelection, instruction: z.string().optional() }),
	async (input) => {
		return AppFactory.controllers()
			.diagrams()
			.startGenerateMermaid(requestActor(), input as GenerateMermaidDiagramInput);
	}
);

export const reviseDiagram = command(
	z.object({
		noteId: z.string().uuid(),
		source: z.string(),
		instruction: z.string(),
		renderedPngDataUrl: z.string().max(14_000_000).optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.diagrams()
			.startReviseInlineMermaid(requestActor(), input as ReviseInlineMermaidInput);
	}
);

export const convertDiagram = command(
	z.object({
		noteId: z.string().uuid(),
		source: z.string().trim().min(1).max(50_000),
		instruction: z.string().trim().max(2_000).optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.diagrams()
			.startConvertInlineMermaid(requestActor(), input as ConvertInlineMermaidInput);
	}
);

export const captureNote = form(
	z.object({ title: z.string().trim().min(1, 'Give the note a title first.') }),
	async ({ title }) => {
		const { note } = await AppFactory.controllers().notes().create(requestActor(), { title });
		redirect(303, `/notes/${note.id}`);
	}
);
