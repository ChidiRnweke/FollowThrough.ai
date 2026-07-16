import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type {
	CreateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ProjectId,
	UpdateMemoryEntryInput
} from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const projectId = url.searchParams.get('projectId') as ProjectId | null;
	if (!projectId) throw error(400, 'projectId is required');
	const factory = AppFactory.controllerFactory();
	const output = await factory.memory().list(AppFactory.actor(), { projectId });
	return json(output);
};

export const PUT: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as CreateMemoryEntryInput;
	const factory = AppFactory.controllerFactory();
	const output = await factory.memory().create(AppFactory.actor(), input);
	return json(output);
};

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as UpdateMemoryEntryInput;
	const factory = AppFactory.controllerFactory();
	const output = await factory.memory().update(AppFactory.actor(), input);
	return json(output);
};

export const DELETE: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as DeleteMemoryEntryInput;
	const factory = AppFactory.controllerFactory();
	await factory.memory().remove(AppFactory.actor(), input);
	return json({ ok: true });
};
