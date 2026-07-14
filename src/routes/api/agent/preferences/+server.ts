import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const inputSchema = z.object({
	defaultModel: z.string().min(1).nullable().optional(),
	executionMode: z.enum(['approval_required', 'auto_accept'])
});

export const GET: RequestHandler = async () => {
	const factory = AppFactory.controllerFactory();
	return json({ preferences: await factory.agentSettings().getPreferences(AppFactory.actor()) });
};

export const PUT: RequestHandler = async ({ request }) => {
	const input = inputSchema.parse(await request.json());
	const factory = AppFactory.controllerFactory();
	return json({
		preferences: await factory.agentSettings().updatePreferences(AppFactory.actor(), input)
	});
};
