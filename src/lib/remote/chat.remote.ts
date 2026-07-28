import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import { runIdInput, submitAgentRunSchema } from './chat-schema';
import type { AgentRunId, ConversationId, SubmitAgentRunInput } from '$lib/models';

export const submitAgentRun = command(submitAgentRunSchema, async (input) =>
	AppFactory.controllerFactory()
		.agent()
		.submit(requestActor(), input as SubmitAgentRunInput)
);

export const getAgentRun = query(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.getRun(requestActor(), runId as AgentRunId)
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
			.decide(requestActor(), input as never)
);

export const cancelAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.cancel(requestActor(), runId as AgentRunId)
);

export const retryAgentRun = command(
	z.object({ runId: z.string().uuid(), requestId: z.string().uuid() }),
	async ({ runId, requestId }) =>
		AppFactory.controllerFactory()
			.agent()
			.retry(requestActor(), runId as AgentRunId, requestId)
);

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllerFactory();
	return factory.agent().getSession(requestActor(), conversationId as ConversationId);
});

export const renameSession = command(
	z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
	async ({ conversationId, title }) =>
		AppFactory.controllerFactory()
			.agent()
			.renameSession(requestActor(), conversationId as never, title)
);

export const deleteSession = command(
	z.object({ conversationId: z.string().uuid() }),
	async ({ conversationId }) => {
		await AppFactory.controllerFactory()
			.agent()
			.deleteSession(requestActor(), conversationId as never);
	}
);
