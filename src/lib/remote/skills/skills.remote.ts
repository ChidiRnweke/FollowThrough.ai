import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { NoteId } from '$lib/models/notes';

const noteId = z.string().uuid();

export const saveSkillDraft = command(
	z.object({
		noteId,
		baseRevision: z.number().int().positive(),
		description: z.string(),
		instructions: z.string()
	}),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.update(requestActor(), { ...input, noteId: input.noteId as NoteId });
		return { saved: true };
	}
);

export const importSkillMarkdown = command(
	z.object({ noteId, raw: z.string(), baseRevision: z.number().int().positive() }),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.update(requestActor(), {
				noteId: input.noteId as NoteId,
				raw: input.raw,
				baseRevision: input.baseRevision
			});
		return { saved: true };
	}
);
