import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type { AcceptSuggestionInput, Diagram, RejectSuggestionInput } from '$lib/models';
import type { DiagramId, NoteId } from '$lib/models';
import { postgresTransactionRunner } from '$lib/server/db';

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
		return postgresTransactionRunner.run(async () => {
			const accepted = await AppFactory.controllerFactory()
				.suggestions()
				.accept(AppFactory.actor(), input as AcceptSuggestionInput);
			if (!input.drawioReview) return accepted;
			if (accepted.suggestion.kind !== 'diagram' || accepted.suggestion.payload.kind !== 'drawio')
				throw new Error('The suggestion did not create the expected draw.io diagram.');
			const artifact = accepted.artifact as Diagram;
			if (artifact.noteId !== input.drawioReview.noteId)
				throw new Error('The suggestion did not create the expected draw.io diagram.');
			const saved = await AppFactory.controllerFactory()
				.diagrams()
				.saveDrawio(AppFactory.actor(), {
					noteId: input.drawioReview.noteId as NoteId,
					diagramId: artifact.id as DiagramId,
					source: input.drawioReview.source,
					renderedSvg: input.drawioReview.renderedSvg
				});
			return { ...accepted, artifact: saved.diagram };
		});
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
