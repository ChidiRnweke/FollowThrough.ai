import type { RunAgentInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { ndjsonResponse } from '$lib/server/ndjson';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as RunAgentInput;
	const factory = AppFactory.controllerFactory();
	return ndjsonResponse(factory.agent().run(AppFactory.actor(), input));
};
