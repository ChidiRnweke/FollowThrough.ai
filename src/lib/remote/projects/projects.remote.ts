import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { MoveProjectEntryInput, ProjectId } from '$lib/models/projects';
import type {
	ArchiveNoteInput,
	DeleteNoteForeverInput,
	EmptyNoteTrashInput,
	NoteId,
	RestoreNoteInput
} from '$lib/models/notes';

/**
 * Parsed, branded ids — the schema establishes the type instead of a cast
 * asserting it. Declared before the commands that use them: a `z.object(...)`
 * runs at module load, so a schema defined further down the file is still in its
 * temporal dead zone when the first command is built.
 */
const projectIdSchema = z
	.string()
	.uuid()
	.transform((value) => value as ProjectId);
const noteIdSchema = z
	.string()
	.uuid()
	.transform((value) => value as NoteId);

export const moveEntry = command(
	z.object({
		projectId: z.string().uuid(),
		entryId: z.string().uuid(),
		parentId: z.string().uuid().optional(),
		position: z.number().int().nonnegative()
	}),
	async (input) => {
		return AppFactory.controllers()
			.projects()
			.move(requestActor(), input as MoveProjectEntryInput);
	}
);

export const archiveNote = command(z.object({ noteId: z.string().uuid() }), async (input) => {
	return AppFactory.controllers()
		.notes()
		.archive(requestActor(), input as ArchiveNoteInput);
});

export const restoreNote = command(z.object({ noteId: z.string().uuid() }), async (input) => {
	return AppFactory.controllers()
		.notes()
		.restore(requestActor(), input as RestoreNoteInput);
});

export const deleteNoteForever = command(z.object({ noteId: z.string().uuid() }), async (input) => {
	return AppFactory.controllers()
		.notes()
		.deleteForever(requestActor(), input as DeleteNoteForeverInput);
});

export const emptyNoteTrash = command(
	z.object({ projectId: z.string().uuid().optional() }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.emptyTrash(requestActor(), input as EmptyNoteTrashInput);
	}
);

export const createSkill = command(
	z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		// Branded where they are parsed, so what comes out of the schema is already
		// the id type the controller wants. The alternative is a cast at the call
		// site, which asserts the very thing the schema is here to establish.
		//
		// Required, like `createNote` above. The skills catalog shows no project, so
		// it sends the inbox — which it can name, because the role is on the project
		// it already lists. Nothing on this side of the wire invents one.
		projectId: projectIdSchema,
		parentId: noteIdSchema.optional()
	}),
	async (input) =>
		// Built field by field rather than spread and asserted: `{ ...input } as
		// CreateSkillInput` turns off exactly the checking that catches a field
		// arriving in the wrong shape.
		AppFactory.controllers()
			.skills()
			.create(requestActor(), {
				name: input.name,
				projectId: input.projectId,
				...(input.description === undefined ? {} : { description: input.description }),
				...(input.parentId === undefined ? {} : { parentId: input.parentId })
			})
);
