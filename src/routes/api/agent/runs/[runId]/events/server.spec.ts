import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { InMemoryRunEventFeed } from '$lib/testing/agent/fakes/in-memory-run-event-feed';
import { _runEventsResponse as runEventsResponse } from './+server';

const runId = '32000000-0000-4000-8000-000000000001' as AgentRunId;

const open = (
	feed: InMemoryRunEventFeed,
	init: { readonly query?: string; readonly headers?: HeadersInit; readonly signal?: AbortSignal }
) => {
	const request = new Request(
		`http://localhost/api/agent/runs/${runId}/events${init.query ?? ''}`,
		{
			headers: init.headers,
			signal: init.signal
		}
	);
	return runEventsResponse(feed, { runId, request, url: new URL(request.url) });
};

/** Lets the stream's chained reads and the feed's queued notifications run to rest. */
const settle = async () => {
	for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
};

const deliveredIds = (text: string) => [...text.matchAll(/^id: (\d+)$/gm)].map((match) => match[1]);

describe('the run event stream', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('delivers each event after the cursor as an agent frame and closes once the run settles', async () => {
		const feed = new InMemoryRunEventFeed(runId);
		feed.append({ type: 'run_started', runId, attempt: 1 });
		feed.append({ type: 'text_delta', text: 'Hello' });
		const response = await open(feed, { query: '?after=1' });
		feed.settle('completed');

		expect(await response.text()).toBe(
			'id: 2\nevent: agent\ndata: {"kind":"readable","cursor":"2",' +
				`"runId":"${runId}","attempt":1,"event":{"type":"text_delta","text":"Hello"},` +
				'"createdAt":"2026-01-01T00:00:00.000Z"}\n\n'
		);
	});

	it.each([
		['a Last-Event-ID header', { headers: { 'last-event-id': 'not-a-cursor' } }],
		['an after parameter', { query: '?after=-4' }]
	])('refuses a malformed cursor in %s without leaving a subscription', async (_, init) => {
		const feed = new InMemoryRunEventFeed(runId);
		const status = await open(feed, init).then(
			() => 'streamed',
			(failure: Error) => (isHttpError(failure) ? failure.status : failure.message)
		);

		expect({ status, subscriptions: feed.subscriptions }).toEqual({
			status: 400,
			subscriptions: 0
		});
	});

	it('releases the subscription and its timers when the consumer cancels', async () => {
		const feed = new InMemoryRunEventFeed(runId);
		const response = await open(feed, {});
		await settle();
		await response.body?.cancel();

		expect({ subscriptions: feed.subscriptions, timers: vi.getTimerCount() }).toEqual({
			subscriptions: 0,
			timers: 0
		});
	});

	it('releases the subscription and its timers when the request aborted before streaming', async () => {
		const feed = new InMemoryRunEventFeed(runId);
		const request = new AbortController();
		request.abort();
		await open(feed, { signal: request.signal });
		await settle();

		expect({ subscriptions: feed.subscriptions, timers: vi.getTimerCount() }).toEqual({
			subscriptions: 0,
			timers: 0
		});
	});

	it('leaves later events in the log while the consumer is not reading, then delivers each once', async () => {
		const feed = new InMemoryRunEventFeed(runId);
		const response = await open(feed, {});
		feed.append({ type: 'run_started', runId, attempt: 1 });
		await settle();
		for (const text of ['one', 'two', 'three', 'four']) feed.append({ type: 'text_delta', text });
		await vi.advanceTimersByTimeAsync(60_000);
		await settle();
		const readWhileStalled = feed.readThrough;
		feed.settle('completed');

		expect({ readWhileStalled, delivered: deliveredIds(await response.text()) }).toEqual({
			readWhileStalled: '1',
			delivered: ['1', '2', '3', '4', '5']
		});
	});
});
