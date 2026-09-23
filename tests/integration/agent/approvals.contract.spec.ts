import { RunPreparation } from '$lib/server/services/agent/runs/preparation';
import { RunApprovals } from '$lib/server/services/agent/runs/approvals';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { InMemoryAgentRunner } from '$lib/testing/agent/fakes/in-memory-agent';
import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import {
	AgentRunRecords,
	AgentSessionRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
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
		status: 'awaiting_approval',
		serializedState: 'provider-checkpoint',
		requestId: `approval-contract-${suffix}`,
		pendingDecisions: [{ callId: 'call-a', toolName: 'archive_note', arguments: {} }],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Cancel this request' },
		contextSnapshot: { contextNotes: [], skills: { items: [] } },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
	return { owner, run };
};

const approvalController = (db: typeof context.db) => {
	const { database, transactionRunner } = createTransactionContext(db);
	const runs = new AgentRunRecords(database);
	const events = new AgentRunEventRecords(database);
	const runner = new InMemoryAgentRunner();
	const completion = Promise.withResolvers<void>();
	runner.completion = completion.promise;
	runner.abortable = true;
	const controller = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			approvals: new RunApprovals(runs),
			runner,
			sessions: new AgentSessionRecords(database),
			conversationJournal: new ConversationArchive(new ConversationRecords(database)),
			events,
			transactionRunner,
			cancellations: new RunCancellation(runs),
			preparation: new RunPreparation(runs),
			settlements: new RunSettlements(runs, events),
			decisions: new AgentRunDecisionRecords(database),
			eventBus: { notify: () => {} }
		})
	);
	return { controller, runner, completion };
};

it('does not append another requeue after a concurrent approval already queued the run', async () => {
	const { owner, run } = await seed('17201');
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { controller, runner, completion } = approvalController(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const queuing = blocker.begin(async (transaction) => {
		await transaction`update agent_runs set status = 'queued' where id = ${run.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const decision = controller.decide(owner, {
			runId: run.id,
			callId: 'call-a',
			decision: 'approve'
		});
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Approval has not reached the locked run');
		});
		release.resolve();
		await queuing;
		await decision;
		await runner.started.promise;
		const events = await new AgentRunEventRecords(context.db).replay(owner, run.id, '0');
		const decisions = await new AgentRunDecisionRecords(context.db).loadUnconsumed(run.id);
		expect({
			requeues: events.filter(
				(record) => record.kind === 'readable' && record.event.type === 'run_queued'
			).length,
			decisions: decisions.map((record) => record.decision)
		}).toEqual({ requeues: 0, decisions: ['approve'] });
	} finally {
		release.resolve();
		await queuing;
		await controller.cancel(owner, run.id);
		completion.resolve();
		await vi.waitFor(async () => {
			const current = await new AgentRunRecords(context.db).findById(owner, run.id);
			if (current?.status !== 'cancelled') throw new Error('Cancellation has not settled');
		});
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('rejects an approval after concurrent cancellation without recording a decision', async () => {
	const { owner, run } = await seed('17202');
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { controller, completion } = approvalController(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const cancelling = blocker.begin(async (transaction) => {
		await transaction`update agent_runs set status = 'cancelling', cancel_requested_at = ${now} where id = ${run.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const decision = controller
			.decide(owner, { runId: run.id, callId: 'call-a', decision: 'approve' })
			.catch((error) => {
				if (!(error instanceof Error) || error.message !== 'The agent run is not awaiting approval')
					throw error;
				return { kind: 'failure' as const };
			});
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Approval has not reached the locked run');
		});
		release.resolve();
		await cancelling;
		const result = await decision;
		expect({
			rejected: 'kind' in result && result.kind === 'failure',
			decisions: await new AgentRunDecisionRecords(context.db).loadUnconsumed(run.id)
		}).toEqual({ rejected: true, decisions: [] });
	} finally {
		release.resolve();
		await cancelling;
		completion.resolve();
		await Promise.all([writer.close(), blocker.end()]);
	}
});
