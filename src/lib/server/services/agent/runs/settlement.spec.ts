import { describe, expect, it } from 'vitest';
import type { AgentRun, AgentRunId, ConversationId } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSettlements } from './settlement';

const setup = (status: 'running' | 'cancelling' = 'running') => {
	const runs = new InMemoryAgentRunPersistence();
	const run: AgentRun = {
		kind: 'agent',
		id: '30000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: '30000000-0000-4000-8000-000000000002' as ConversationId,
		userId: testActor().userId,
		status,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		requestId: 'settlement-test',
		pendingDecisions: [],
		inputSnapshot: { prompt: 'Test' },
		createdAt: testNow,
		updatedAt: testNow
	};
	runs.runs.push(run);
	const service = new RunSettlements(runs, runs, new InMemoryTransactionRunner([runs]));
	const completed = {
		kind: 'completed' as const,
		conversationId: run.conversationId,
		model: run.model
	};
	return { runs, run, service, completed };
};
describe('Run settlement', () => {
	it('skips success materialization after cancellation wins', async () => {
		const { runs, run, service, completed } = setup('cancelling');
		await service.settle(run.id, completed, async () => {
			throw new Error('Success must not be materialized');
		});
		expect({ status: runs.runs[0].status, events: runs.events }).toEqual({
			status: 'cancelling',
			events: []
		});
	});
	it('appends the terminal event after the materialized output', async () => {
		const { runs, run, service, completed } = setup();
		await service.settle(run.id, completed, async () => {
			await runs.append(run.id, 1, { type: 'text_delta', text: 'Done' });
		});
		expect(runs.events.map((record) => record.event.type)).toEqual(['text_delta', 'completed']);
	});
	it('rolls back both the transition and output on failure', async () => {
		const { runs, run, service, completed } = setup();
		await service
			.settle(run.id, completed, async () => {
				await runs.append(run.id, 1, { type: 'text_delta', text: 'Discard' });
				throw new Error('Session write failed');
			})
			.then(
				() => {
					throw new Error('Expected failure');
				},
				(error) => {
					if (!(error instanceof Error) || error.message !== 'Session write failed') throw error;
				}
			);
		expect({ status: runs.runs[0].status, events: runs.events }).toEqual({
			status: 'running',
			events: []
		});
	});
});
