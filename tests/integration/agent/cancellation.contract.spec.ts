import { AgentSessionRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import type { ActorContext } from '$lib/models/identity';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { AgentRunNotificationRecords } from '$lib/server/repositories/agent/postgres/run-notifications';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedProvenance, notifications } from '../database-harness';

const seed = async (suffix: string) => {
	const owner = actor(suffix);
	await new UserRecords(owner, context.db).ensureLocal();
	const conversation = await new ConversationRecords(owner, context.db).insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const provenance = await seedProvenance(owner, suffix);
	const run = await new AgentRunRecords(owner, context.db).insert({
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
		contextSnapshot: { contextNotes: [], contextResources: [], skills: { items: [] } },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
	return { owner, run };
};

const cancellationController = (actor: ActorContext, db: typeof context.db) => {
	const { database, transactionRunner } = createTransactionContext(db);
	const runs = new AgentRunRecords(actor, database);
	const events = new AgentRunEventRecords(actor, database);
	return new AgentSdkHarness(
		actor,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			records: new AgentRunHarnessRecords(
				runs,
				events,
				new AgentRunDecisionRecords(actor, database),
				new AgentSessionRecords(actor, database)
			),
			transitions: new RunTransitions(runs),
			conversationMessages: new ConversationArchive(
				actor,
				new ConversationRecords(actor, database)
			),
			conversationSessions: new ConversationArchive(
				actor,
				new ConversationRecords(actor, database)
			),
			transactionRunner,
			settlements: new RunSettlements(runs, events),
			runSignals: new RunSignalService(new AgentRunNotificationRecords(notifications), runs)
		})
	);
};

it('aborts a running execution in another process after it wins the row lock', async () => {
	const { owner, run } = await seed('17101');
	const execution = new AbortController();
	const watching = new RunSignalService(
		new AgentRunNotificationRecords(notifications),
		new AgentRunRecords(owner, context.db)
	);
	const stopWatching = await watching.abortOnCancel(run.id, execution);
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const controller = cancellationController(owner, writer.db);
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
		const cancellation = controller.cancel(run.id);
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Cancellation has not reached the locked run');
		});
		release.resolve();
		await starting;
		const snapshot = await cancellation;
		await vi.waitFor(() => {
			if (!execution.signal.aborted) throw new Error('The execution has not been told to stop');
		});
		expect({
			status: snapshot.run.status,
			startedAt: snapshot.run.startedAt,
			aborted: execution.signal.aborted
		}).toEqual({ status: 'cancelling', startedAt: now, aborted: true });
	} finally {
		release.resolve();
		await starting;
		await stopWatching();
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('stores one terminal event when two connections cancel the same queued run', async () => {
	const { owner, run } = await seed('17102');
	const writer = connectPostgresTestDatabase(context.url);
	try {
		await Promise.all([
			cancellationController(owner, context.db).cancel(run.id),
			cancellationController(owner, writer.db).cancel(run.id)
		]);
		const events = await new AgentRunEventRecords(owner, context.db).replay(run.id, '0');
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
		const records = new AgentRunRecords(owner, context.db);
		await new RunTransitions(records).claim(run.id, now);
		const checkpoints = new RunTransitions(records);
		await checkpoints.persistCheckpoint(
			run.id,
			checkpoints.prepareCheckpoint(
				run,
				{
					serializedState: 'provider-checkpoint',
					pendingDecisions: [
						{
							callId: 'call-cleared',
							toolName: 'archive_note',
							arguments: { noteId: '40000000-0000-4000-8000-000000017601' }
						}
					]
				},
				now
			)
		);
		if (status === 'queued') {
			await new AgentRunDecisionRecords(owner, context.db).record({
				runId: run.id,
				callId: 'call-cleared',
				decision: 'approve'
			});
			const approvals = new RunTransitions(records);
			const current = await approvals.getForWrite(run.id);
			const change = approvals.planApproval(current, ['call-cleared'], now);
			if (!change) throw new Error('Expected approval to queue the checkpoint');
			await approvals.persistApproval(run.id, change);
		}
		const snapshot = await cancellationController(owner, context.db).cancel(run.id);
		const stored = await records.findById(run.id);
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
	await expect(cancellationController(actor('17104'), context.db).cancel(run.id)).rejects.toThrow(
		'not found'
	);
});
