import { json } from '@sveltejs/kit';
import type { RelateSelectionInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as RelateSelectionInput;
	return json(
		await AppFactory.controllerFactory()
			.relationships()
			.suggestFromSelection(AppFactory.actor(), input)
	);
};
