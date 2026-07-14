import { json } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const factory = AppFactory.controllerFactory();
	return json({ models: await factory.agentSettings().listModels(AppFactory.actor()) });
};
