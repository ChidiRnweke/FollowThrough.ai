import type { AgentRunId, StoredAgentRunEventRecord } from '$lib/models/agent';
import { agentRunCursorSchema } from '$lib/models/agent';
import { error } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { RequestHandler } from './$types';

/** The part of the agent harness that one run's event stream reads. */
type RunEventFeed = Pick<
	ReturnType<ControllerFactory['agentHarness']>,
	'observeRun' | 'listRunEvents' | 'isRunStreamComplete'
>;

const encoder = new TextEncoder();
const keepaliveFrame = encoder.encode(': keepalive\n\n');

const cursorAfter = (request: Request, url: URL): string => {
	const value = request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0';
	const parsed = agentRunCursorSchema.safeParse(value);
	if (!parsed.success) error(400, 'Invalid agent event cursor');
	return parsed.data;
};

const eventFrames = (records: readonly StoredAgentRunEventRecord[]): Uint8Array =>
	encoder.encode(
		records
			.map((record) => `id: ${record.cursor}\nevent: agent\ndata: ${JSON.stringify(record)}\n\n`)
			.join('')
	);

/**
 * Stream a run's events after the request's cursor as server-sent events, until the run's
 * durable tail has been delivered.
 *
 * The stream reads the log only when the consumer has room for more, so a consumer that stops
 * reading holds at most one queued chunk. Change signals, the fallback poll and the keepalive
 * only mark work as due; the next read starts from the delivered cursor, so a signal that
 * arrives while the consumer is behind is not lost.
 */
export const _runEventsResponse = async (
	agent: RunEventFeed,
	input: { readonly runId: AgentRunId; readonly request: Request; readonly url: URL }
): Promise<Response> => {
	const { runId, request } = input;
	let cursor = cursorAfter(request, input.url);
	let unread = true;
	let keepaliveDue = false;
	let resume = () => {};
	// Subscribe before the stream starts, so a change between the ownership check and the first
	// read still marks the log as unread.
	const unsubscribe = await agent.observeRun(runId, () => {
		unread = true;
		resume();
	});

	// From here on, every exit releases the subscription and both timers exactly once.
	let released = false;
	let endStream = () => {};
	const fallbackTimer = setInterval(() => {
		// Defensive fallback in case a notification is missed.
		unread = true;
		resume();
	}, 5_000);
	const keepaliveTimer = setInterval(() => {
		keepaliveDue = true;
		resume();
	}, 15_000);
	const onAbort = () => endStream();
	const release = () => {
		if (released) return;
		released = true;
		clearInterval(fallbackTimer);
		clearInterval(keepaliveTimer);
		request.signal.removeEventListener('abort', onAbort);
		resume();
		// chisel-ignore fail-loudly:silent-catch -- the stream is already closing; a failed UNLISTEN only leaves an idle listener on the shared connection.
		unsubscribe().catch((error: unknown) =>
			console.error(`[agent-run] Could not stop observing ${runId}:`, error)
		);
	};

	try {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				endStream = () => {
					if (released) return;
					release();
					controller.close();
				};
				request.signal.addEventListener('abort', onAbort);
				if (request.signal.aborted) endStream();
			},
			// The default queuing strategy holds one chunk, so `pull` runs only once the consumer
			// has taken the previous chunk.
			async pull(controller) {
				try {
					while (!released) {
						if (unread) {
							unread = false;
							const records = await agent.listRunEvents(runId, cursor);
							if (released) return;
							const last = records.at(-1);
							if (last) {
								controller.enqueue(eventFrames(records));
								cursor = last.cursor;
							}
							if (await agent.isRunStreamComplete(runId, cursor)) return endStream();
							if (last) return;
						} else if (keepaliveDue) {
							keepaliveDue = false;
							controller.enqueue(keepaliveFrame);
							return;
						} else {
							await new Promise<void>((wake) => (resume = wake));
						}
					}
				} catch (failure) {
					release();
					throw failure;
				}
			},
			cancel() {
				release();
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
	} catch (failure) {
		release();
		throw failure;
	}
};

export const GET: RequestHandler = ({ params, request, url, locals }) =>
	_runEventsResponse(AppFactory.forActor(AppFactory.actor(locals)).agentHarness(), {
		runId: params.runId as AgentRunId,
		request,
		url
	});
