import { json } from '@sveltejs/kit';
import type { SuggestionId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as { suggestionId: SuggestionId; decision: string };
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
	const result =
		body.decision === 'accept'
			? await factory.suggestions().accept(actor, { suggestionId: body.suggestionId })
			: await factory.suggestions().reject(actor, { suggestionId: body.suggestionId });
	return json(result);
};
