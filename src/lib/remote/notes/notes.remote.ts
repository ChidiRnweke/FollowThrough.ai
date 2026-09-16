import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import { startExtractPromisesSchema } from '$lib/models/todos';
import { startFindReferencesSchema } from '$lib/models/references';
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
import { startRelateSelectionSchema } from '$lib/models/relationships';
import type { NoteId } from '$lib/models/notes';

const noteId = z
	.string()
	.uuid()
	.transform((value) => value as NoteId);
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

export const extractPromises = command(startExtractPromisesSchema, async (input) => {
	return AppFactory.controllers().todos().startExtractPromises(requestActor(), input);
});

export const relateNote = command(startRelateSelectionSchema, async (input) => {
	return AppFactory.controllers().relationships().startSuggestFromSelection(requestActor(), input);
});

export const findReferences = command(startFindReferencesSchema, async (input) => {
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
