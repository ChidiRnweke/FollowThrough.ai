import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type { RejectSuggestionInput } from '$lib/models';

export const acceptSuggestion = command(
	z.object({
		suggestionId: z.string().uuid(),
		drawioReview: z
			.object({
				noteId: z.string().uuid(),
				source: z.string().trim().min(1).max(2_000_000),
				renderedSvg: z.string().trim().min(1).max(2_000_000)
			})
			.optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.suggestions()
			.acceptReviewed(requestActor(), input as never);
	}
);

export const rejectSuggestion = command(
	z.object({ suggestionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.controllers()
			.suggestions()
			.reject(requestActor(), input as RejectSuggestionInput);
	}
);
