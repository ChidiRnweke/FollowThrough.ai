import { z } from 'zod';
import { redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type { ExtractPromisesInput } from '$lib/models/todos';
import type {
	ConvertInlineMermaidInput,
	GenerateMermaidDiagramInput,
	ReviseInlineMermaidInput
} from '$lib/models/diagrams';
import type {
	ListNoteSyncInventoryInput,
	PublishNoteInput,
	DiscardNoteDraftInput,
	SyncNoteInput
} from '$lib/models/notes';
import { MAX_NOTE_DOCUMENTS } from '$lib/models/notes';
import type { RelateSelectionInput } from '$lib/models/relationships';
import type { NoteId } from '$lib/models/notes';

const noteSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	projectId: z.string().uuid(),
	parentId: z.string().uuid().optional(),
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
	publishedAt: z.string().optional(),
	archivedAt: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string()
});

const textSelection = z
	.object({
		noteId: z.string().uuid(),
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
		.save(requestActor(), input as never);
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

export const listNoteSyncInventory = query(
	z.object({ projectId: z.string().uuid().optional() }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.listSyncInventory(requestActor(), input as ListNoteSyncInventoryInput);
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
		.startSuggestFromSelection(requestActor(), input as never);
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
