import { z } from 'zod';
import type { RunAgentInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { ndjsonResponse } from '$lib/server/ndjson';
import type { RequestHandler } from './$types';

const id = z.string().uuid();
const inputSchema = z.object({
	requestId: id.optional(),
	conversationId: id.optional(),
	projectId: id.optional(),
	noteId: id.optional(),
	selection: z
		.object({
			noteId: id,
			revision: z.number().int().positive(),
			from: z.number().int().nonnegative(),
			to: z.number().int().nonnegative(),
			text: z.string()
		})
		.optional(),
	contextNoteIds: z.array(id).optional(),
	requestedSkillNames: z.array(z.string().min(1)).optional(),
	modelOverride: z.string().min(1).nullable().optional(),
	executionModeOverride: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
	prompt: z.string().min(1)
});

export const POST: RequestHandler = async ({ request }) => {
	const input = inputSchema.parse(await request.json()) as RunAgentInput;
	const factory = AppFactory.controllerFactory();
	return ndjsonResponse(factory.agent().run(AppFactory.actor(), input, request.signal));
};
