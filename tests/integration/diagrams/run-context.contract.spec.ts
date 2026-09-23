import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId, WorkflowRunContext } from '$lib/models/agent';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import { actor, context, now, seedProvenance } from '../database-harness';

const seed = async (suffix: string) => {
	const owner = actor(suffix);
	await new UserRecords(context.db).ensureLocal(owner);
	const conversation = await new ConversationRecords(context.db).insert(owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'workflow',
		createdAt: now,
		updatedAt: now
	});
	const run = await new AgentRunRecords(context.db).insert(owner, {
		kind: 'workflow',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'test/frozen',
		executionMode: 'auto_accept',
		status: 'running',
		requestId: `diagram-context-${suffix}`,
		pendingDecisions: [],
		definitionVersion: 2,
		contextSnapshot: { kind: 'diagram', state: 'unprepared', operation: 'convert' },
		createdAt: now,
		updatedAt: now
	});
	const provenance = await seedProvenance(owner, suffix);
	const prepared: Extract<WorkflowRunContext, { kind: 'diagram'; state: 'prepared' }> = {
		kind: 'diagram',
		state: 'prepared',
		context: { contextNotes: [], skills: { items: [] } },
		conversationId: conversation.id,
		effectiveModel: run.model,
		executionMode: 'auto_accept',
		provenanceId: provenance.id,
		diagramOperation: 'convert'
	};
	return { owner, run, prepared };
};

it('rejects diagram preparation when cancellation commits before the context lock', async () => {
	const { owner, run, prepared } = await seed('17301');
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { database, transactionRunner } = createTransactionContext(writer.db);
	const contexts = new DiagramRunContext(new AgentRunRecords(database));
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
		const rejected = expect(
			transactionRunner.run(async () => {
				const current = await contexts.getForWrite(owner, run.id);
				await contexts.persist(owner, run.id, contexts.prepare(current, prepared, now));
			})
		).rejects.toThrow('no longer running');
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Preparation has not reached the locked run');
		});
		release.resolve();
		await cancelling;
		await rejected;
	} finally {
		release.resolve();
		await cancelling;
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('writes only resolved workflow context fields', async () => {
	const { owner, run, prepared } = await seed('17302');
	const records = new AgentRunRecords(context.db);
	await context.client`update agent_runs set status = 'cancelling', cancel_requested_at = ${now}, started_at = ${now} where id = ${run.id}`;
	const updated = await records.updateWorkflowContext(owner, run.id, {
		contextSnapshot: prepared,
		updatedAt: now
	});
	expect({
		status: updated.status,
		cancelRequestedAt: updated.cancelRequestedAt,
		startedAt: updated.startedAt,
		requestId: updated.requestId,
		context: updated.contextSnapshot
	}).toEqual({
		status: 'cancelling',
		cancelRequestedAt: now,
		startedAt: now,
		requestId: run.requestId,
		context: prepared
	});
});

it('does not expose another actor’s workflow through the context lock', async () => {
	const { run } = await seed('17303');
	const { database, transactionRunner } = createTransactionContext(context.db);
	await expect(
		transactionRunner.run(() =>
			new DiagramRunContext(new AgentRunRecords(database)).getForWrite(actor('17304'), run.id)
		)
	).rejects.toThrow('not found');
});
