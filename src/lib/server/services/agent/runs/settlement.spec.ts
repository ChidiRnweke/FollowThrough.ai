import { describe, expect, it } from 'vitest';
import type { AgentRun, AgentRunId, AgentRunStatus, ConversationId } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSettlements } from './settlement';

const setup = (status: AgentRunStatus = 'running', kind: 'agent' | 'workflow' = 'agent') => {
	const runs = new InMemoryAgentRunPersistence();
	const run: AgentRun = {
		id: '30000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: '30000000-0000-4000-8000-000000000002' as ConversationId,
		userId: testActor().userId,
		status,
		model: 'openai/test-model',
		executionMode: kind === 'workflow' ? 'auto_accept' : 'approval_required',
		requestId: 'settlement-test',
		pendingDecisions: [],
		...(status === 'queued' ? {} : { startedAt: testNow }),
		...(['completed', 'failed', 'cancelled'].includes(status) ? { finishedAt: testNow } : {}),
		...(status === 'cancelling' || status === 'cancelled' ? { cancelRequestedAt: testNow } : {}),
		...(status === 'failed'
			? { failure: 'Provider failed', providerErrorCode: 'TEST_FAILURE' }
			: {}),
		...(kind === 'agent'
			? {
					kind: 'agent' as const,
					inputSnapshot: {
						conversationId: '30000000-0000-4000-8000-000000000002' as ConversationId,
						prompt: 'Test'
					}
				}
			: {
					kind: 'workflow' as const,
					contextSnapshot: {
						kind: 'note_action' as const,
						action: 'diagram' as const,
						noteId: testNoteId()
					}
				}),
		createdAt: testNow,
		updatedAt: testNow
	};
	runs.runs.push(run);
	const service = new RunSettlements(runs, runs);
	const completed = {
		kind: 'completed' as const,
		conversationId: run.conversationId,
		model: run.model
	};
	return { runs, run, service, completed };
};
describe('Run settlement', () => {
	it.each(['queued', 'completed', 'failed', 'cancelled'] as const)(
		'refuses completion from %s',
		async (status) => {
			const { run, service, completed } = setup(status);
			expect(await service.claim(run.id, completed)).toEqual({ kind: 'lost' });
		}
	);

	it('does not skip the cancellation request when settling a running run', async () => {
		const { run, service } = setup();
		expect(await service.claim(run.id, { kind: 'cancelled', message: 'Stopped' })).toEqual({
			kind: 'lost'
		});
	});

	it('clears the saved checkpoint when a resumed run completes', async () => {
		const { runs, run, service, completed } = setup();
		runs.runs[0] = {
			...run,
			serializedState: 'resumed-checkpoint',
			pendingDecisions: [
				{ callId: 'reviewed-call', toolName: 'create_note', arguments: { title: 'Draft' } }
			]
		};
		const claim = await service.claim(run.id, completed);
		if (claim.kind === 'lost') throw new Error('Expected completion');
		expect({
			checkpoint: claim.run.serializedState,
			pending: claim.run.pendingDecisions,
			timestampsMatch: claim.run.finishedAt === claim.run.updatedAt
		}).toEqual({ checkpoint: undefined, pending: [], timestampsMatch: true });
	});

	it('refuses a completion claim after cancellation wins', async () => {
		const { runs, run, service, completed } = setup('cancelling');
		const claim = await service.claim(run.id, completed);
		expect({ claim, status: runs.runs[0].status, events: runs.events }).toEqual({
			claim: { kind: 'lost' },
			status: 'cancelling',
			events: []
		});
	});
	it('records a workflow result before its terminal event', async () => {
		const { runs, run, service, completed } = setup('running', 'workflow');
		const claim = await service.claim(run.id, {
			...completed,
			kind: 'workflow_completed',
			action: 'diagram',
			result: { saved: true }
		});
		if (claim.kind === 'lost') throw new Error('Expected the completion claim');
		await service.complete(claim);
		expect(runs.events.map((record) => record.event.type)).toEqual([
			'workflow_result',
			'completed'
		]);
	});
	it('does not publish completion before the controller saves its output', async () => {
		const { runs, run, service, completed } = setup();
		await service.claim(run.id, completed);
		expect(runs.events).toEqual([]);
	});
});
