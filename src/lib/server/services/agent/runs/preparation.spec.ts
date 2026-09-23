import { expect, it } from 'vitest';
import type { AgentRunId, ResolvedAgentRun } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import {
	testActor,
	testConversationId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { RunPreparation, RunPreparationCancelled } from './preparation';

const context = { contextNotes: [], skills: { items: [] } };
const setup = async (status: 'queued' | 'running' | 'cancelling' | 'cancelled' = 'running') => {
	const runs = new InMemoryAgentRunPersistence();
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
	await runs.insert(testActor(), run);
	return { runs, run, preparation: new RunPreparation(runs) };
};

it('claims a queued chat run at the supplied start time', async () => {
	const { run, preparation } = await setup('queued');
	const claimed = await preparation.claim(run.id, testNow);
	expect({ status: claimed?.status, startedAt: claimed?.startedAt }).toEqual({
		status: 'running',
		startedAt: testNow
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
		await expect(preparation.getForWrite(testActor(), run.id)).rejects.toBeInstanceOf(
			RunPreparationCancelled
		);
	}
);

it('does not expose another actor’s chat run', async () => {
	const { run, preparation } = await setup();
	await expect(preparation.getForWrite(testActor(2), run.id)).rejects.toThrow('not found');
});

it('retains authoritative provenance when preparation already recorded it', () => {
	const preparation = new RunPreparation(new InMemoryAgentRunPersistence());
	expect(
		preparation.provenance({ provenanceId: testProvenanceId() }, testProvenanceId(2), testNow)
	).toEqual({ provenanceId: testProvenanceId(), updatedAt: testNow });
});

it('records new provenance for an unprepared run', () => {
	const preparation = new RunPreparation(new InMemoryAgentRunPersistence());
	expect(preparation.provenance({}, testProvenanceId(), testNow)).toEqual({
		provenanceId: testProvenanceId(),
		updatedAt: testNow
	});
});

it('keeps frozen context when later configuration differs', () => {
	const preparation = new RunPreparation(new InMemoryAgentRunPersistence());
	expect(
		preparation.context(
			{ contextSnapshot: context },
			{ ...context, userMemory: ['New preference'] },
			testNow
		)
	).toEqual({ contextSnapshot: context, updatedAt: testNow });
});

it('records newly built context for an unprepared run', () => {
	const preparation = new RunPreparation(new InMemoryAgentRunPersistence());
	expect(preparation.context({}, context, testNow)).toEqual({
		contextSnapshot: context,
		updatedAt: testNow
	});
});
