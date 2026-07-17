import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type { AgentRunId, ConversationId, SubmitAgentRunInput } from '$lib/models';

const runIdInput = z.object({ runId: z.string().uuid() });

export const submitAgentRun = command(
	z.object({
		requestId: z.string().uuid(),
		conversationId: z.string().uuid().optional(),
		input: z.string().trim().min(1),
		model: z.string().nullable().optional(),
		mode: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
		projectId: z.string().uuid().optional(),
		noteId: z.string().uuid().optional(),
		selection: z
			.object({
				noteId: z.string().uuid(),
				revision: z.number().int().nonnegative(),
				from: z.number().int().nonnegative(),
				to: z.number().int().nonnegative(),
				text: z.string()
			})
			.optional(),
		contextNoteIds: z.array(z.string().uuid()).optional(),
		requestedSkillNames: z.array(z.string()).optional(),
		requestedSkillNoteIds: z.array(z.string().uuid()).optional()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.agent()
			.submit(AppFactory.actor(), input as SubmitAgentRunInput)
);

export const getAgentRun = query(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.getRun(AppFactory.actor(), runId as AgentRunId)
);

export const decideAgentRun = command(
	z.object({
		runId: z.string().uuid(),
		callId: z.string().min(1),
		decision: z.enum(['approve', 'reject']),
		message: z.string().optional()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.agent()
			.decide(AppFactory.actor(), input as never)
);

export const cancelAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.cancel(AppFactory.actor(), runId as AgentRunId)
);

export const retryAgentRun = command(
	z.object({ runId: z.string().uuid(), requestId: z.string().uuid() }),
	async ({ runId, requestId }) =>
		AppFactory.controllerFactory()
			.agent()
			.retry(AppFactory.actor(), runId as AgentRunId, requestId)
);

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllerFactory();
	return factory.agent().getSession(AppFactory.actor(), conversationId as ConversationId);
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
