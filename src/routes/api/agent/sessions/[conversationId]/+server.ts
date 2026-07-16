import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { ConversationId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const conversationId = z.string().uuid().parse(params.conversationId) as ConversationId;
	return json(
		await AppFactory.controllerFactory().agent().getSession(AppFactory.actor(), conversationId)
	);
};
