import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import { startExtractPromisesSchema } from '$lib/models/todos';
import { startFindReferencesSchema } from '$lib/models/references';
import {
	startGenerateMermaidSchema,
	startReviseInlineMermaidSchema,
	startConvertInlineMermaidSchema
} from '$lib/models/diagrams';
import type {
	GetNoteRevisionInput,
	DiscardNoteDraftInput,
	RestoreNoteRevisionInput
} from '$lib/models/notes';
import { startRelateSelectionSchema } from '$lib/models/relationships';
import type { NoteId } from '$lib/models/notes';

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

export const generateDiagram = command(startGenerateMermaidSchema, async (input) => {
	return AppFactory.controllers().diagrams().startGenerateMermaid(requestActor(), input);
});

export const reviseDiagram = command(startReviseInlineMermaidSchema, async (input) => {
	return AppFactory.controllers().diagrams().startReviseInlineMermaid(requestActor(), input);
});

export const convertDiagram = command(startConvertInlineMermaidSchema, async (input) => {
	return AppFactory.controllers().diagrams().startConvertInlineMermaid(requestActor(), input);
});
