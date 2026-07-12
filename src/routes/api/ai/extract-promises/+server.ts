import { json } from '@sveltejs/kit';
import type { ExtractPromisesInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as ExtractPromisesInput;
	return json(
		await AppFactory.controllerFactory().todos().extractPromises(AppFactory.actor(), input)
	);
};
