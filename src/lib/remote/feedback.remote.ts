import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { db } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/schema';

export const submitFeedback = command(
	z.object({
		body: z.string().min(1).max(10_000),
		url: z.string().max(2000),
		appContext: z.record(z.string(), z.unknown())
	}),
	async (input) => {
		const actor = AppFactory.actor();
		await db.insert(feedbackReports).values({
			userId: actor.userId,
			body: input.body,
			url: input.url,
			appContext: input.appContext as Record<string, unknown>
		});
	}
);
