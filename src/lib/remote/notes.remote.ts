import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type {
	ExtractPromisesInput,
	GenerateMermaidDiagramInput,
	RelateSelectionInput,
	ReviseInlineMermaidInput
} from '$lib/models';
import type { NoteId } from '$lib/models';

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
	isPinned: z.boolean(),
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

export const saveNote = command(z.object({ note: noteSchema }), async (input) => {
	return AppFactory.controllerFactory()
		.notes()
		.save(AppFactory.actor(), input as never);
});

export const getNote = query(z.string().uuid(), async (noteId) => {
	const view = await AppFactory.controllerFactory()
		.notes()
		.get(AppFactory.actor(), { noteId: noteId as NoteId });
	return view.note;
});

export const extractPromises = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllerFactory()
		.todos()
		.extractPromises(AppFactory.actor(), input as ExtractPromisesInput);
});

export const relateNote = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllerFactory()
		.relationships()
		.suggestFromSelection(AppFactory.actor(), input as RelateSelectionInput);
});

export const findReferences = command(z.object({ selection: textSelection }), async (input) => {
	return AppFactory.controllerFactory()
		.references()
		.suggestFromSelection(AppFactory.actor(), input as never);
});

export const generateDiagram = command(
	z.object({ selection: textSelection, instruction: z.string().optional() }),
	async (input) => {
		return AppFactory.controllerFactory()
			.diagrams()
			.generateMermaid(AppFactory.actor(), input as GenerateMermaidDiagramInput);
	}
);

export const reviseDiagram = command(
	z.object({
		noteId: z.string().uuid(),
		source: z.string(),
		instruction: z.string()
	}),
	async (input) => {
		try {
			return await AppFactory.controllerFactory()
				.diagrams()
				.reviseInlineMermaid(AppFactory.actor(), input as ReviseInlineMermaidInput);
		} catch (e) {
			return { error: e instanceof Error ? e.message : 'Diagram revision failed.' };
		}
	}
);
