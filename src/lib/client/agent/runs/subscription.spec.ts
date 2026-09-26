import { describe, expect, it } from 'vitest';
import type { StoredAgentRunEventRecord, AgentRunId } from '$lib/models/agent';
import { InMemoryRunEventSource } from '$lib/testing/agent/fakes/in-memory-run-event-source';
import { RunEventSubscription } from './subscription';

const runId = '30000000-0000-4000-8000-000000000001' as AgentRunId;
const record = (cursor: string): StoredAgentRunEventRecord => ({
	kind: 'readable',
	runId,
	cursor,
	attempt: 1,
	createdAt: new Date(0),
	event: { type: 'text_delta', text: cursor }
});
const setup = (onEvent: (event: StoredAgentRunEventRecord) => Promise<void> | void) => {
	const source = new InMemoryRunEventSource();
	const subscription = new RunEventSubscription(
		{ runId, after: '0', onOpen: () => {}, onError: () => {}, onEvent },
		source.open
	);
	return { source, subscription };
};
describe('durable run consumption', () => {
	it('resumes past an unreadable record after its handler succeeds', async () => {
		const { source, subscription } = setup((event) => {
			if (event.cursor === '3') throw new Error('Persistence unavailable');
		});
		try {
			source.emit(record('1'));
			source.emit({
				kind: 'unreadable',
				runId,
				cursor: '2',
				attempt: 1,
				createdAt: new Date(0),
				reason: 'Unknown event'
			});
			source.emit(record('3'));
			await expect
				.poll(() => source.connections.at(-1)?.input.url, { timeout: 5000 })
				.toBe(`/api/agent/runs/${runId}/events?after=2`);
		} finally {
			subscription.close();
		}
	});
	it('delivers each cursor once in order even when frames arrive during a handler', async () => {
		const consumed: string[] = [];
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { source, subscription } = setup(async (event) => {
			if (event.cursor === '1') await pending;
			consumed.push(event.cursor);
		});
		try {
			source.emit(record('1'));
			source.emit(record('1'));
			source.emit(record('2'));
			release();
			await expect.poll(() => consumed).toEqual(['1', '2']);
		} finally {
			subscription.close();
		}
	});
	it('reconnects from the last successful handler after a later handler fails', async () => {
		const { source, subscription } = setup((event) => {
			if (event.cursor === '2') throw new Error('Editor could not apply the result');
		});
		try {
			source.emit(record('1'));
			source.emit(record('2'));
			source.emit(record('3'));
			await expect
				.poll(() => source.connections.at(-1)?.input.url, { timeout: 5000 })
				.toBe(`/api/agent/runs/${runId}/events?after=1`);
		} finally {
			subscription.close();
		}
	});
	it('does not deliver queued frames after teardown', async () => {
		const consumed: string[] = [];
		const { source, subscription } = setup((event) => {
			consumed.push(event.cursor);
		});
		source.emit(record('1'));
		subscription.close();
		await Promise.resolve();
		expect(consumed).toEqual([]);
	});
});
