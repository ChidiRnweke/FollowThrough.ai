import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import { runIdInput, submitAgentRunSchema } from '$lib/server/agent-request-factory';
import type { AgentRunId, ConversationId, SubmitAgentRunInput } from '$lib/models/agent';

export const submitAgentRun = command(submitAgentRunSchema, async (input) =>
	AppFactory.controllers()
		.agent()
		.submit(requestActor(), input as SubmitAgentRunInput)
);

export const getAgentRun = query(runIdInput, async ({ runId }) =>
	AppFactory.controllers()
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
		AppFactory.controllers()
			.agent()
			.decide(requestActor(), input as never)
);

export const decideAgentRunBatch = command(
	z.object({
		runId: z.string().uuid(),
		callIds: z.array(z.string().min(1)).min(1),
		decision: z.enum(['approve', 'reject']),
		message: z.string().optional()
	}),
	async (input) =>
		AppFactory.controllers()
			.agent()
			.decideMany(requestActor(), input as never)
);

export const cancelAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllers()
		.agent()
		.cancel(requestActor(), runId as AgentRunId)
);

export const retryAgentRun = command(
	z.object({ runId: z.string().uuid(), requestId: z.string().uuid() }),
	async ({ runId, requestId }) =>
		AppFactory.controllers()
			.agent()
			.retry(requestActor(), runId as AgentRunId, requestId)
);

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllers();
	return factory.agent().getSession(requestActor(), conversationId as ConversationId);
});

export const renameSession = command(
	z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
	async ({ conversationId, title }) =>
		AppFactory.controllers()
			.agent()
			.renameSession(requestActor(), conversationId as never, title)
);

export const deleteSession = command(
	z.object({ conversationId: z.string().uuid() }),
	async ({ conversationId }) => {
		await AppFactory.controllers()
			.agent()
			.deleteSession(requestActor(), conversationId as never);
	}
);
