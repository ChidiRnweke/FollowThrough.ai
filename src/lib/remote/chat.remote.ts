import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllerFactory();
	return factory.agent().getSession(AppFactory.actor(), conversationId as never);
});

export const renameSession = command(
	z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
	async ({ conversationId, title }) =>
		AppFactory.controllerFactory()
			.agent()
			.renameSession(AppFactory.actor(), conversationId as never, title)
);

export const deleteSession = command(
	z.object({ conversationId: z.string().uuid() }),
	async ({ conversationId }) => {
		await AppFactory.controllerFactory()
			.agent()
			.deleteSession(AppFactory.actor(), conversationId as never);
	}
);
