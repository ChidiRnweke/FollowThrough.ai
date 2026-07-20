import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { NoteId, ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

/**
 * Ghost text is requested on every typing pause, so this is a plain endpoint
 * rather than a remote command: the client aborts the fetch the moment the user
 * types again, and `request.signal` carries that straight through to the model
 * call instead of letting an abandoned generation finish on our budget.
 */

const id = z.string().uuid();

const requestSchema = z.object({
	noteId: id,
	projectId: id,
	revision: z.number().int().nonnegative(),
	prefix: z.string().max(4000),
	suffix: z.string().max(1000),
	heading: z.string().max(300).optional()
});

export const POST: RequestHandler = async ({ request }) => {
	const input = requestSchema.parse(await request.json());
	const suggestion = await AppFactory.controllerFactory()
		.inlineSuggestions()
		.suggest(
			AppFactory.actor(),
			{
				noteId: input.noteId as NoteId,
				projectId: input.projectId as ProjectId,
				revision: input.revision,
				prefix: input.prefix,
				suffix: input.suffix,
				...(input.heading ? { heading: input.heading } : {})
			},
			request.signal
		);
	return json(suggestion);
};
