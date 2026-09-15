import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, StoredAgentRunEventRecord } from '$lib/models/agent';
import { InMemoryRunTransport } from '$lib/testing/agent/fakes/in-memory-run-transport';
import { InMemoryRunClientStorage } from '$lib/testing/agent/fakes/in-memory-run-client-storage';
import { ChatStore, entryText } from './chat.svelte';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { DateTime } from '$lib/models/workspace';

const runId = '10000000-0000-4000-8000-000000000001' as AgentRunId;
const conversationId = '20000000-0000-4000-8000-000000000001' as ConversationId;
const frame: StoredAgentRunEventRecord = {
	kind: 'readable',
	runId,
	cursor: '1',
	attempt: 1,
	createdAt: new Date(0),
	event: { type: 'text_delta', text: 'Saved once.' }
};
const setup = async () => {
	const transport = new InMemoryRunTransport({
		runId,
		conversationId,
		status: 'queued',
		latestCursor: '0'
	});
	const storage = new InMemoryRunClientStorage();
	const store = new ChatStore('replay-test', transport, storage);
	await store.send({ prompt: 'Read saved activity' });
	return { store, storage, transport };
};
describe('chat replay checkpoints', () => {
	it('detaches from a completed run after consuming its unreadable tail', async () => {
		const { store, transport } = await setup();
		const now = '2026-09-16T00:00:00.000Z' as DateTime;
		transport.snapshot = {
			run: {
				kind: 'agent',
				id: runId,
				userId: testActor().userId,
				conversationId,
				model: 'test/model',
				executionMode: 'approval_required',
				status: 'completed',
				requestId: 'test-replay-request',
				pendingDecisions: [],
				contextSnapshot: { contextNotes: [], skills: { items: [] } },
				inputSnapshot: {
					conversationId,
					prompt: 'Read saved activity'
				},
				createdAt: now,
				updatedAt: now
			},
			latestCursor: '2',
			pendingDecisions: []
		};
		await transport.deliver({
			kind: 'unreadable',
			runId,
			cursor: '2',
			attempt: 1,
			createdAt: new Date(0),
			reason: 'Unknown completion event'
		});
		transport.disconnect();
		await expect
			.poll(() => ({ connection: store.connection, status: store.entries.at(-1)?.status }))
			.toEqual({ connection: 'detached', status: 'completed' });
	});
	it('keeps the previous cursor when session storage rejects a checkpoint', async () => {
		const { store, storage, transport } = await setup();
		storage.writable = false;
		const failed = await transport.deliver(frame).then(
			() => ({ kind: 'success' as const }),
			() => ({ kind: 'failure' as const })
		);
		if (failed.kind !== 'failure') throw new Error('Storage failure was not exercised');
		expect(store.cursor).toBe('0');
	});
	it('does not append text twice when replay retries a failed checkpoint', async () => {
		const { store, storage, transport } = await setup();
		storage.writable = false;
		const failed = await transport.deliver(frame).then(
			() => ({ kind: 'success' as const }),
			() => ({ kind: 'failure' as const })
		);
		if (failed.kind !== 'failure') throw new Error('Storage failure was not exercised');
		storage.writable = true;
		await transport.deliver(frame);
		expect(entryText(store.entries.at(-1)!)).toBe('Saved once.');
	});
	it('reports unreadable saved activity and checkpoints its cursor', async () => {
		const { store, storage, transport } = await setup();
		await transport.deliver({
			kind: 'unreadable',
			runId,
			cursor: '2',
			attempt: 1,
			createdAt: new Date(0),
			reason: 'Unknown event'
		});
		expect({ parts: store.entries.at(-1)?.parts, checkpoint: storage.state }).toEqual({
			parts: [{ kind: 'unreadable', reason: 'Some saved agent activity could not be restored.' }],
			checkpoint: { kind: 'valid', state: { runId, cursor: '2', attempt: 1 } }
		});
	});
});
