import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { NoteId } from '$lib/models/notes';
import { readSkillManifest } from './manifest-reader.server';
import { skillFrontmatterSchema } from '$lib/models/skills';

const noteId = z.string().uuid();

export const saveSkillDraft = command(
	z.object({
		noteId,
		baseRevision: z.number().int().positive(),
		description: skillFrontmatterSchema.shape.description,
		instructions: z.string()
	}),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.update(requestActor(), {
				noteId: input.noteId as NoteId,
				description: input.description,
				content: {
					kind: 'instructions',
					text: input.instructions,
					baseRevision: input.baseRevision
				}
			});
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
				content: {
					kind: 'manifest',
					manifest: readSkillManifest(input.raw),
					baseRevision: input.baseRevision
				}
			});
		return { saved: true };
	}
);
