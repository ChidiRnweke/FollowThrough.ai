import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedProvenance } from '../database-harness';

const seed = async (suffix: string) => {
	const owner = actor(suffix);
	await new UserRecords(context.db).ensureLocal(owner);
	const conversation = await new ConversationRecords(context.db).insert(owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const provenance = await seedProvenance(owner, suffix);
	const run = await new AgentRunRecords(context.db).insert(owner, {
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: `cancellation-contract-${suffix}`,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Cancel this request' },
		contextSnapshot: { contextNotes: [], skills: { items: [] } },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
	return { owner, run };
};

const cancellationController = (db: typeof context.db) => {
	const { database, transactionRunner } = createTransactionContext(db);
	const runs = new AgentRunRecords(database);
	const events = new AgentRunEventRecords(database);
	return new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			conversationJournal: new ConversationArchive(new ConversationRecords(database)),
			events,
			transactionRunner,
			cancellations: new RunCancellation(runs),
			settlements: new RunSettlements(runs, events),
			decisions: new AgentRunDecisionRecords(database),
			eventBus: { notify: () => {} }
		})
	);
};

it('cancels the authoritative running state after execution wins the row lock', async () => {
	const { owner, run } = await seed('17101');
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const controller = cancellationController(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const starting = blocker.begin(async (transaction) => {
		await transaction`update agent_runs set status = 'running', started_at = ${now} where id = ${run.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const cancellation = controller.cancel(owner, run.id);
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Cancellation has not reached the locked run');
		});
		release.resolve();
		await starting;
		const snapshot = await cancellation;
		const events = await new AgentRunEventRecords(context.db).replay(owner, run.id, '0');
		expect({
			status: snapshot.run.status,
			startedAt: snapshot.run.startedAt,
			events: events.map((record) => (record.kind === 'readable' ? record.event.type : record.kind))
		}).toEqual({ status: 'cancelled', startedAt: now, events: ['cancelled'] });
	} finally {
		release.resolve();
		await starting;
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('stores one terminal event when two connections cancel the same queued run', async () => {
	const { owner, run } = await seed('17102');
	const writer = connectPostgresTestDatabase(context.url);
	try {
		await Promise.all([
			cancellationController(context.db).cancel(owner, run.id),
			cancellationController(writer.db).cancel(owner, run.id)
		]);
		const events = await new AgentRunEventRecords(context.db).replay(owner, run.id, '0');
		expect(
			events.map((record) => (record.kind === 'readable' ? record.event.type : record.kind))
		).toEqual(['cancelled']);
	} finally {
		await writer.close();
	}
});

it.each(['awaiting_approval', 'queued'] as const)(
	'returns cleared approvals after cancelling a %s checkpoint',
	async (status) => {
		const { owner, run } = await seed(status === 'queued' ? '17602' : '17601');
		const records = new AgentRunRecords(context.db);
		await records.transition(run.id, 'queued', 'running', { startedAt: now });
		await records.transition(run.id, 'running', 'awaiting_approval', {
			serializedState: 'provider-checkpoint',
			pendingDecisions: [
				{
					callId: 'call-cleared',
					toolName: 'archive_note',
					arguments: { noteId: '40000000-0000-4000-8000-000000017601' }
				}
			]
		});
		if (status === 'queued') {
			await new AgentRunDecisionRecords(context.db).record(owner, {
				runId: run.id,
				callId: 'call-cleared',
				decision: 'approve'
			});
			await records.transition(run.id, 'awaiting_approval', 'queued');
		}
		const snapshot = await cancellationController(context.db).cancel(owner, run.id);
		const stored = await records.findById(owner, run.id);
		expect({
			status: snapshot.run.status,
			run: snapshot.run.pendingDecisions,
			cards: snapshot.pendingDecisions,
			stored: stored?.pendingDecisions
		}).toEqual({ status: 'cancelled', run: [], cards: [], stored: [] });
	}
);

it('does not expose another actor’s run through the locking read', async () => {
	const { run } = await seed('17103');
	await expect(cancellationController(context.db).cancel(actor('17104'), run.id)).rejects.toThrow(
		'not found'
	);
});
