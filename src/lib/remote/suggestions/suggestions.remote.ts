import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { RejectSuggestionInput, SuggestionId } from '$lib/models/suggestions';
import type { NoteId } from '$lib/models/notes';

const suggestionId = z.string().uuid().transform((value) => value as SuggestionId);
const noteId = z.string().uuid().transform((value) => value as NoteId);

export const acceptSuggestion = command(
	z.object({
		suggestionId,
		drawioReview: z
			.object({
				noteId,
				source: z.string().trim().min(1).max(2_000_000),
				renderedSvg: z.string().trim().min(1).max(2_000_000)
			})
			.optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.suggestions()
			.acceptReviewed(requestActor(), input);
	}
);

export const rejectSuggestion = command(
	z.object({ suggestionId }),
	async (input) => {
		return AppFactory.controllers()
			.suggestions()
			.reject(requestActor(), input as RejectSuggestionInput);
	}
);
