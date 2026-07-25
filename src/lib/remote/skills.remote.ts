import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { NoteId } from '$lib/models';

export const toggleSkill = command(
	z.object({ noteId: z.string().uuid(), enabled: z.boolean() }),
	async (input) => {
		await AppFactory.controllerFactory()
			.skills()
			.update(requestActor(), {
				noteId: input.noteId as NoteId,
				isEnabled: input.enabled
			});
		return { enabled: input.enabled };
	}
);
