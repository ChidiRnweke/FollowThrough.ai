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
		return AppFactory.forActor(requestActor())
			.notes()
			.discardDraft(input as DiscardNoteDraftInput);
	}
);

export const listNoteRevisions = command(z.string().uuid(), async (noteId) => {
	return AppFactory.forActor(requestActor())
		.notes()
		.listRevisions({ noteId: noteId as NoteId });
});

export const getNoteRevision = query(
	z.object({ noteId: z.string().uuid(), revisionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.forActor(requestActor())
			.notes()
			.getRevision(input as GetNoteRevisionInput);
	}
);

export const restoreNoteRevision = command(
	z.object({ noteId: z.string().uuid(), revisionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.forActor(requestActor())
			.notes()
			.restoreRevision(input as RestoreNoteRevisionInput);
	}
);

export const extractPromises = command(startExtractPromisesSchema, async (input) => {
	return AppFactory.forActor(requestActor()).todos().startExtractPromises(input);
});

export const relateNote = command(startRelateSelectionSchema, async (input) => {
	return AppFactory.forActor(requestActor()).relationships().startSuggestFromSelection(input);
});

export const findReferences = command(startFindReferencesSchema, async (input) => {
	return AppFactory.forActor(requestActor()).references().startSuggestFromSelection(input);
});

export const generateDiagram = command(startGenerateMermaidSchema, async (input) => {
	return AppFactory.forActor(requestActor()).diagrams().startGenerateMermaid(input);
});

export const reviseDiagram = command(startReviseInlineMermaidSchema, async (input) => {
	return AppFactory.forActor(requestActor()).diagrams().startReviseInlineMermaid(input);
});

export const convertDiagram = command(startConvertInlineMermaidSchema, async (input) => {
	return AppFactory.forActor(requestActor()).diagrams().startConvertInlineMermaid(input);
});
