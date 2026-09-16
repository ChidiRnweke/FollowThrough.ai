import { command } from '$app/server';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import { AppFactory } from '$lib/server/factories/app-factory';
import { feedbackReportSchema } from '$lib/models/feedback';

export const submitFeedback = command(feedbackReportSchema, async (input) => {
	const actor = requestActor();
	await AppFactory.controllers().feedback().submit(actor, {
		body: input.body,
		url: input.url,
		appContext: input.appContext
	});
});
