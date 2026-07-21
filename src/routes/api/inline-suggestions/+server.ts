import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ExternalServiceError, type NoteId } from '$lib/models';
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
	try {
		const suggestion = await controller.suggest(actor, inlineRequest, request.signal);
		if (suggestion.outcome === 'busy' || suggestion.outcome === 'rate_limited') {
			const retryAfterSeconds = Math.max(1, Math.ceil(suggestion.retryAfterMs / 1_000));
			return json(suggestion, {
				status: 429,
				headers: { 'Retry-After': String(retryAfterSeconds) }
			});
		}
		return json(suggestion);
	} catch (error) {
		if (request.signal.aborted) throw error;
		if (error instanceof ExternalServiceError)
			return json({ outcome: 'provider_failure' }, { status: 502 });
		throw error;
	}
};
