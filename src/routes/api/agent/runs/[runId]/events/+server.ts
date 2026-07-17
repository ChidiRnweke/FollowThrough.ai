import type { AgentRunId } from '$lib/models';
import { isTerminalAgentRunStatus } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { setTimeout as wait } from 'node:timers/promises';
import type { RequestHandler } from './$types';

const encoder = new TextEncoder();

const cursorAfter = (request: Request, url: URL): string => {
	const value = request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0';
	return /^\d+$/.test(value) ? value : '0';
};

export const GET: RequestHandler = async ({ params, request, url }) => {
	const actor = AppFactory.actor();
	const agent = AppFactory.controllerFactory().agent();
	const runId = params.runId as AgentRunId;
	await agent.getRun(actor, runId);
	let cursor = cursorAfter(request, url);
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			let keepaliveAt = Date.now();
			try {
				while (!request.signal.aborted) {
					const records = await agent.listRunEvents(actor, runId, cursor);
					for (const record of records) {
						controller.enqueue(
							encoder.encode(
								`id: ${record.cursor}\nevent: agent\ndata: ${JSON.stringify(record)}\n\n`
							)
						);
						cursor = record.cursor;
					}
					const snapshot = await agent.getRun(actor, runId);
					if (
						isTerminalAgentRunStatus(snapshot.run.status) &&
						BigInt(cursor) >= BigInt(snapshot.latestCursor)
					)
						break;
					if (Date.now() - keepaliveAt >= 15_000) {
						controller.enqueue(encoder.encode(': keepalive\n\n'));
						keepaliveAt = Date.now();
					}
					await wait(1_000, undefined, { signal: request.signal });
				}
			} catch (error) {
				if (!(error instanceof Error && error.name === 'AbortError')) controller.error(error);
				return;
			}
			controller.close();
		}
	});
	return new Response(body, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
