import { json } from '@sveltejs/kit';
import type { UpdateTodoInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as UpdateTodoInput;
	const factory = AppFactory.controllerFactory();
	const output = await factory.todos().update(AppFactory.actor(), input);
	return json(output);
};
