import type { AgentRunId } from '$lib/models';
import { isTerminalAgentRunStatus } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const encoder = new TextEncoder();

const cursorAfter = (request: Request, url: URL): string => {
	const value = request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0';
	return /^\d+$/.test(value) ? value : '0';
};

export const GET: RequestHandler = async ({ params, request, url, locals }) => {
	const actor = AppFactory.actor(locals);
	const agent = AppFactory.controllerFactory().agent();
	const eventBus = AppFactory.eventBus();
	const runId = params.runId as AgentRunId;
	await agent.getRun(actor, runId);
	let cursor = cursorAfter(request, url);

	let teardown = () => {};

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			let flushing = false;
			let pendingFlush = false;

			const cleanup = () => {
				closed = true;
				clearInterval(fallbackTimer);
				clearInterval(keepaliveTimer);
				unsubscribe();
			};
			teardown = cleanup;

			const close = () => {
				if (closed) return;
				cleanup();
				try {
					controller.close();
				} catch {
					// The runtime already closed the controller (e.g. client disconnect).
				}
			};

			const flush = async () => {
				if (closed) return;
				if (flushing) {
					pendingFlush = true;
					return;
				}
				flushing = true;
				try {
					do {
						pendingFlush = false;
						const records = await agent.listRunEvents(actor, runId, cursor);
						for (const record of records) {
							if (closed) return;
							try {
								controller.enqueue(
									encoder.encode(
										`id: ${record.cursor}\nevent: agent\ndata: ${JSON.stringify(record)}\n\n`
									)
								);
							} catch {
								cleanup();
								return;
							}
							cursor = record.cursor;
						}
						const snapshot = await agent.getRun(actor, runId);
						if (
							isTerminalAgentRunStatus(snapshot.run.status) &&
							BigInt(cursor) >= BigInt(snapshot.latestCursor)
						) {
							close();
							return;
						}
					} while (pendingFlush && !closed);
				} catch (error) {
					if (!closed) {
						cleanup();
						try {
							controller.error(error);
						} catch {
							// The runtime already closed the controller.
						}
					}
				} finally {
					flushing = false;
				}
			};

			// Initial replay from cursor
			void flush();

			// Push notifications from the event bus
			const unsubscribe = eventBus.subscribe(runId, () => void flush());

			// Defensive fallback poll every 5s in case a notification is missed
			const fallbackTimer = setInterval(() => void flush(), 5_000);

			// Keepalive heartbeat
			const keepaliveTimer = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					cleanup();
				}
			}, 15_000);

			// Clean up on client disconnect
			request.signal.addEventListener('abort', close);
		},
		cancel() {
			teardown();
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
