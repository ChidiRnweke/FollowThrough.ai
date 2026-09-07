import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import {
	runIdInput,
	submitAgentRunSchema
} from '$lib/server/factories/agent/agent-request-factory';
import type { AgentRunId, ConversationId } from '$lib/models/agent';

const agentRunId = z
	.string()
	.uuid()
	.transform((value) => value as AgentRunId);
const conversationId = z
	.string()
	.uuid()
	.transform((value) => value as ConversationId);

export const submitAgentRun = command(submitAgentRunSchema, async (input) =>
	AppFactory.controllers().agent().submit(requestActor(), input)
);

export const getAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllers().agent().getRun(requestActor(), runId)
);

export const decideAgentRun = command(
	z.object({
		runId: agentRunId,
		callId: z.string().min(1),
		decision: z.enum(['approve', 'reject']),
		message: z.string().optional()
	}),
	async (input) => AppFactory.controllers().agent().decide(requestActor(), input)
);

export const decideAgentRunBatch = command(
	z.object({
		runId: agentRunId,
		callIds: z.array(z.string().min(1)).min(1),
		decision: z.enum(['approve', 'reject']),
		message: z.string().optional()
	}),
	async (input) => AppFactory.controllers().agent().decideMany(requestActor(), input)
);

export const cancelAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllers().agent().cancel(requestActor(), runId)
);

export const retryAgentRun = command(
	z.object({ runId: agentRunId, requestId: z.string().uuid() }),
	async ({ runId, requestId }) =>
		AppFactory.controllers().agent().retry(requestActor(), runId, requestId)
);

export const renameSession = command(
	z.object({ conversationId, title: z.string().trim().min(1).max(80) }),
	async ({ conversationId, title }) =>
		AppFactory.controllers().agent().renameSession(requestActor(), conversationId, title)
);

export const deleteSession = command(z.object({ conversationId }), async ({ conversationId }) => {
	await AppFactory.controllers().agent().deleteSession(requestActor(), conversationId);
});
