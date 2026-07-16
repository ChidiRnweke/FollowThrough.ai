import { json } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
	json(await AppFactory.controllerFactory().agent().listSessions(AppFactory.actor()));
