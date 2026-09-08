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
	DiscardNoteDraftInput,
	RestoreNoteRevisionInput
} from '$lib/models/notes';
import type { RelateSelectionInput } from '$lib/models/relationships';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

const noteId = z
	.string()
	.uuid()
	.transform((value) => value as NoteId);
const projectId = z
	.string()
	.uuid()
	.transform((value) => value as ProjectId);
const textSelection = z
	.object({
		noteId,
		revision: z.number().int().positive(),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		text: z.string()
	})
	.refine((s) => s.to >= s.from, 'Selection end must follow its start.');

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

export const listNoteRevisions = command(z.string().uuid(), async (noteId) => {
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
	return AppFactory.controllers().references().startSuggestFromSelection(requestActor(), input);
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
	z.object({
		title: z.string().trim().min(1, 'Give the note a title first.'),
		projectId
	}),
	async ({ title, projectId }) => {
		const actor = requestActor();
		// The page passes the inbox, found by role. Note creation used to answer a
		// missing project itself with `findFirstActive`, filing the note wherever
		// the sort order happened to land.
		const { note } = await AppFactory.controllers().notes().create(actor, { title, projectId });
		redirect(303, `/notes/${note.id}`);
	}
);
