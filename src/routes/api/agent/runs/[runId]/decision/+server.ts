import { z } from 'zod';
import { AppFactory } from '$lib/server/app-factory';
import { ndjsonResponse } from '$lib/server/ndjson';
import type { AgentRunId } from '$lib/models';
import type { RequestHandler } from './$types';

const inputSchema = z.object({
	callId: z.string().min(1),
	decision: z.enum(['approve', 'reject']),
	message: z.string().optional()
});

export const POST: RequestHandler = async ({ params, request }) => {
	const input = inputSchema.parse(await request.json());
	const factory = AppFactory.controllerFactory();
	return ndjsonResponse(
		factory.agent().decide(
			AppFactory.actor(),
			{
				runId: params.runId as AgentRunId,
				...input
			},
			request.signal
		)
	);
};
