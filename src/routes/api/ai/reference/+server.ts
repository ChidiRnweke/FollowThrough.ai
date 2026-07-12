import { json } from '@sveltejs/kit';
import type { FindReferencesInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as FindReferencesInput;
	return json(
		await AppFactory.controllerFactory()
			.references()
			.suggestFromSelection(AppFactory.actor(), input)
	);
};
