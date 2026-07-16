import { z } from 'zod';
import { query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllerFactory();
	return factory.agent().getSession(AppFactory.actor(), conversationId as never);
});
