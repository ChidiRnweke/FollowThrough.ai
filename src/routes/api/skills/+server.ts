import { json } from '@sveltejs/kit';
import type { CreateSkillInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const factory = AppFactory.controllerFactory();
	return json(await factory.skills().list(AppFactory.actor()));
};

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as CreateSkillInput;
	const factory = AppFactory.controllerFactory();
	return json(await factory.skills().create(AppFactory.actor(), input));
};
