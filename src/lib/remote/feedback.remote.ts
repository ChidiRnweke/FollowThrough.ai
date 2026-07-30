import { z } from 'zod';
import { command } from '$app/server';
import { requestActor } from '$lib/server/request-actor-factory';
import { AppFactory } from '$lib/server/app-factory';

export const submitFeedback = command(
	z.object({
		body: z.string().min(1).max(10_000),
		url: z.string().max(2000),
		appContext: z.record(z.string(), z.unknown())
	}),
	async (input) => {
		const actor = requestActor();
		await AppFactory.controllers().feedback().submit(actor, {
			body: input.body,
			url: input.url,
			appContext: input.appContext
		});
	}
);
