import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { NoteId } from '$lib/models';
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
	purpose: z.enum(['warm', 'complete']).default('complete'),
	noteId: id,
	requestId: id,
	revision: z.number().int().nonnegative(),
	blockType: z.string().min(1).max(50),
	headingPath: z.array(z.string().max(300)).max(8),
	currentSection: z.string().max(8000),
	prefix: z.string().max(4000),
	suffix: z.string().max(1000),
	heading: z.string().max(300).optional()
});

export const POST: RequestHandler = async ({ request }) => {
	const input = requestSchema.parse(await request.json());
	const controller = AppFactory.controllerFactory().inlineSuggestions();
	const actor = AppFactory.actor();
	const inlineRequest = {
		requestId: input.requestId,
		noteId: input.noteId as NoteId,
		revision: input.revision,
		blockType: input.blockType,
		headingPath: input.headingPath,
		currentSection: input.currentSection,
		prefix: input.prefix,
		suffix: input.suffix,
		...(input.heading ? { heading: input.heading } : {})
	};
	if (input.purpose === 'warm')
		return json({ ready: await controller.warm(actor, inlineRequest, request.signal) });
	const suggestion = await controller.suggest(actor, inlineRequest, request.signal);
	return json(suggestion);
};
