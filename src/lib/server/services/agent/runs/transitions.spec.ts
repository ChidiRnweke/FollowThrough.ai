import { expect, it } from 'vitest';
import type {
	AgentRunId,
	AgentRunStatus,
	PendingAgentDecision,
	ResolvedAgentRun
} from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import {
	testActor,
	testConversationId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { RunTransitions } from './transitions';
import { RunPreparationCancelled } from '$lib/errors';

const fresh = () => new RunTransitions(new InMemoryAgentRunPersistence(testActor()));

const context = { contextNotes: [], contextResources: [], skills: { items: [] } };
const setup = async (status: 'queued' | 'running' | 'cancelling' | 'cancelled' = 'running') => {
	const runs = new InMemoryAgentRunPersistence(testActor());
	const run: ResolvedAgentRun = {
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: testActor().userId,
		conversationId: testConversationId(),
		model: 'test/model',
		executionMode: 'approval_required',
		status,
		requestId: crypto.randomUUID(),
		pendingDecisions: [],
		inputSnapshot: { conversationId: testConversationId(), prompt: 'Help' },
		...(status === 'queued' ? {} : { startedAt: testNow }),
		...(status === 'cancelling' || status === 'cancelled' ? { cancelRequestedAt: testNow } : {}),
		...(status === 'cancelled' ? { finishedAt: testNow } : {}),
		createdAt: testNow,
		updatedAt: testNow
	};
	await runs.insert(run);
	return { runs, run, preparation: new RunTransitions(runs) };
};

it('claims a queued chat run at the supplied start time', async () => {
	const { run, preparation } = await setup('queued');
	const claimed = await preparation.claim(run.id, testNow);
	expect({
		status: claimed?.status,
		startedAt: claimed?.startedAt,
		updatedAt: claimed?.updatedAt
	}).toEqual({
		status: 'running',
		startedAt: testNow,
		updatedAt: testNow
	});
});

it('does not claim a run already started by another executor', async () => {
	const { run, preparation } = await setup();
	expect(await preparation.claim(run.id, testNow)).toBeUndefined();
});

it.each(['cancelling', 'cancelled'] as const)(
	'reports %s before writing preparation',
	async (status) => {
		const { run, preparation } = await setup(status);
		await expect(preparation.getForPreparation(run.id)).rejects.toBeInstanceOf(
			RunPreparationCancelled
		);
	}
);

it('does not expose another actor’s chat run', async () => {
	const { run, runs, preparation } = await setup();
	// The same run, as another account owns it.
	runs.runs = runs.runs.map((stored) => ({ ...stored, userId: testActor(2).userId }));
	await expect(preparation.getForPreparation(run.id)).rejects.toThrow('not found');
});

it('retains authoritative provenance when preparation already recorded it', () => {
	const preparation = fresh();
	expect(
		preparation.provenance({ provenanceId: testProvenanceId() }, testProvenanceId(2), testNow)
	).toEqual({ provenanceId: testProvenanceId(), updatedAt: testNow });
});

it('records new provenance for an unprepared run', () => {
	const preparation = fresh();
	expect(preparation.provenance({}, testProvenanceId(), testNow)).toEqual({
		provenanceId: testProvenanceId(),
		updatedAt: testNow
	});
});

it('keeps frozen context when later configuration differs', () => {
	const preparation = fresh();
	expect(
		preparation.context(
			{ contextSnapshot: context },
			{ ...context, userMemory: ['New preference'] },
			testNow
		)
	).toEqual({ contextSnapshot: context, updatedAt: testNow });
});

it('records newly built context for an unprepared run', () => {
	const preparation = fresh();
	expect(preparation.context({}, context, testNow)).toEqual({
		contextSnapshot: context,
		updatedAt: testNow
	});
});

const pendingDecisions: readonly PendingAgentDecision[] = [
	{ callId: 'call-a', toolName: 'archive_note', arguments: {} }
];

it('requeues a reviewed checkpoint at the decision timestamp', () => {
	const approvals = fresh();
	expect(
		approvals.planApproval({ status: 'awaiting_approval', pendingDecisions }, ['call-a'], testNow)
	).toEqual({ status: 'queued', updatedAt: testNow });
});

it('keeps the first queue transition when another pending call is decided', () => {
	const approvals = fresh();
	expect(
		approvals.planApproval({ status: 'queued', pendingDecisions }, ['call-a'], testNow)
	).toBeNull();
});

it('rejects an entire batch if a call is absent from the checkpoint', () => {
	const approvals = fresh();
	expect(() =>
		approvals.planApproval(
			{ status: 'awaiting_approval', pendingDecisions },
			['call-a', 'call-b'],
			testNow
		)
	).toThrow('The pending tool call was not found');
});

it.each<AgentRunStatus>(['running', 'cancelling', 'completed', 'failed', 'cancelled'])(
	'rejects decisions after the run becomes %s',
	(status) => {
		const approvals = fresh();
		expect(() => approvals.planApproval({ status, pendingDecisions }, ['call-a'], testNow)).toThrow(
			'The agent run is not awaiting approval'
		);
	}
);

it('finishes queued cancellation at the request timestamp', () => {
	const cancellation = fresh();
	expect(cancellation.planCancellation('queued', testNow)).toEqual({
		status: 'cancelled',
		cancelRequestedAt: testNow,
		finishedAt: testNow,
		updatedAt: testNow
	});
});

it.each<AgentRunStatus>(['running', 'awaiting_approval'])(
	'leaves %s completion to settlement',
	(status) => {
		const cancellation = fresh();
		expect(cancellation.planCancellation(status, testNow)).toEqual({
			status: 'cancelling',
			cancelRequestedAt: testNow,
			updatedAt: testNow
		});
	}
);

it.each<AgentRunStatus>(['cancelling', 'cancelled', 'completed', 'failed'])(
	'does not rewrite %s on another cancellation request',
	(status) => {
		const cancellation = fresh();
		expect(cancellation.planCancellation(status, testNow)).toBeNull();
	}
);

const checkpoints = fresh();
const checkpoint = { serializedState: 'provider-state', pendingDecisions: [] };

it('uses the provider trace when a resumed execution supplies it', () => {
	expect(
		checkpoints.prepareCheckpoint(
			{ traceparent: 'previous-trace' },
			{ ...checkpoint, traceparent: 'provider-trace' },
			testNow
		).traceparent
	).toBe('provider-trace');
});

it('keeps the saved trace when the provider omits it', () => {
	expect(
		checkpoints.prepareCheckpoint({ traceparent: 'saved-trace' }, checkpoint, testNow).traceparent
	).toBe('saved-trace');
});

it('represents an absent trace explicitly for persistence', () => {
	expect(checkpoints.prepareCheckpoint({}, checkpoint, testNow).traceparent).toBeNull();
});
