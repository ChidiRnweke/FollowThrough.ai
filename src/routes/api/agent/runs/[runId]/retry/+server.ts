import { AppFactory } from '$lib/server/app-factory';
import { ndjsonResponse } from '$lib/server/ndjson';
import type { AgentRunId } from '$lib/models';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const factory = AppFactory.controllerFactory();
	return ndjsonResponse(
		factory.agent().retry(AppFactory.actor(), params.runId as AgentRunId, request.signal)
	);
};
