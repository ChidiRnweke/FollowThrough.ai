import { describe, expect, it } from 'vitest';
import type { AgentRunId, DateTime } from '$lib/models';
import { PersistentConversationJournal } from '$lib/services';
import { InMemoryAgentRunPersistence } from '$lib/testing/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/fakes/in-memory-conversations';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { testActor } from '$lib/testing/fixtures/domain-builders';
import { DefaultAgentController } from './controller';
import type { AgentRunExecutor } from '$lib/server/domain/agent-run-executor';

const noopExecutor: AgentRunExecutor = {
	execute: async () => 'completed',
	finishCancellation: async () => undefined
} as unknown as AgentRunExecutor;

const setup = () => {
	const runs = new InMemoryAgentRunPersistence();
	const conversations = new InMemoryConversationRepository((runId) =>
		runs.runs.some((run) => run.id === runId)
	);
	const controller = new DefaultAgentController({
		conversationJournal: new PersistentConversationJournal(conversations),
		preferences: {
			get: async (actor) => ({
				userId: actor.userId,
				executionMode: 'approval_required',
				createdAt: '2026-01-01T00:00:00.000Z' as DateTime,
				updatedAt: '2026-01-01T00:00:00.000Z' as DateTime
			}),
			update: async () => {
				throw new Error('Unexpected preference update');
			}
		},
		models: { list: async () => [], assertSelectable: async () => undefined },
		runs,
		events: runs,
		decisions: runs,
		transactionRunner: new InMemoryTransactionRunner([conversations, runs]),
		defaultModel: 'openai/test-model',
		executor: noopExecutor
	});
	return { controller, conversations, runs };
};

describe('durable agent submission', () => {
	it('returns a queued receipt before provider execution', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000001',
			input: 'Help me decide'
		});
		expect(receipt.status).toBe('queued');
	});

	it('records the user prompt against the persisted run', async () => {
		const { controller, conversations } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000009',
			input: 'Help me decide'
		});
		expect(conversations.messages.find((message) => message.role === 'user')?.runId).toBe(
			receipt.runId
		);
	});

	it('records one prompt for a duplicate logical request', async () => {
		const { controller, conversations } = setup();
		const input = {
			requestId: '10000000-0000-4000-8000-000000000002',
			input: 'Compare the options'
		};
		await controller.submit(testActor(), input);
		await controller.submit(testActor(), input);
		expect(conversations.messages.filter((message) => message.role === 'user')).toHaveLength(1);
	});

	it('returns the same run for a duplicate logical request', async () => {
		const { controller } = setup();
		const input = {
			requestId: '10000000-0000-4000-8000-000000000003',
			input: 'Compare the options'
		};
		const first = await controller.submit(testActor(), input);
		const second = await controller.submit(testActor(), input);
		expect(second.runId).toBe(first.runId);
	});

	it('rejects another active run in the same conversation', async () => {
		const { controller } = setup();
		const first = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000004',
			input: 'First'
		});
		await expect(
			controller.submit(testActor(), {
				requestId: '10000000-0000-4000-8000-000000000005',
				conversationId: first.conversationId,
				input: 'Second'
			})
		).rejects.toThrow('active agent run');
	});
});

describe('durable agent lifecycle commands', () => {
	it('cancels a queued run immediately', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000006',
			input: 'Stop before start'
		});
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect(snapshot.run.status).toBe('cancelled');
	});

	it('requeues an approval decision on the same run', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000007',
			input: 'Archive it'
		});
		const original = runs.runs[0]!;
		runs.runs[0] = {
			...original,
			status: 'awaiting_approval',
			pendingDecisions: [{ callId: 'call-1', toolName: 'archive_note', arguments: {} }]
		};
		const snapshot = await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-1',
			decision: 'approve'
		});
		expect(snapshot.run.status).toBe('queued');
	});

	it('rejects a contradictory duplicate decision', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000008',
			input: 'Archive it'
		});
		const original = runs.runs[0]!;
		runs.runs[0] = {
			...original,
			status: 'awaiting_approval',
			pendingDecisions: [{ callId: 'call-2', toolName: 'archive_note', arguments: {} }]
		};
		await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-2',
			decision: 'approve'
		});
		await expect(
			controller.decide(testActor(), {
				runId: receipt.runId,
				callId: 'call-2',
				decision: 'reject'
			})
		).rejects.toThrow('different decision');
	});

	it('manual retry creates ancestry without another prompt', async () => {
		const { controller, conversations, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000009',
			input: 'Try this once'
		});
		const original = runs.runs[0]!;
		runs.runs[0] = { ...original, status: 'failed' };
		await controller.retry(testActor(), receipt.runId, '10000000-0000-4000-8000-000000000010');
		expect(conversations.messages.filter((message) => message.role === 'user')).toHaveLength(1);
	});

	it('manual retry points at the failed run', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000011',
			input: 'Try this once'
		});
		runs.runs[0] = { ...runs.runs[0]!, status: 'failed' };
		const retried = await controller.retry(
			testActor(),
			receipt.runId,
			'10000000-0000-4000-8000-000000000012'
		);
		const child = runs.runs.find((run) => run.id === retried.runId);
		expect(child?.retryOfRunId).toBe(receipt.runId as AgentRunId);
	});
});
