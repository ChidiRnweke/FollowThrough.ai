import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type { AcceptSuggestionInput, RejectSuggestionInput } from '$lib/models';

export const acceptSuggestion = command(
	z.object({ suggestionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.controllerFactory()
			.suggestions()
			.accept(AppFactory.actor(), input as AcceptSuggestionInput);
	}
);

export const rejectSuggestion = command(
	z.object({ suggestionId: z.string().uuid() }),
	async (input) => {
		return AppFactory.controllerFactory()
			.suggestions()
			.reject(AppFactory.actor(), input as RejectSuggestionInput);
	}
);
