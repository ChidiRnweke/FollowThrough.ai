import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { RunPreparation } from '$lib/server/services/agent/runs/preparation';
import { actor, context, now } from '../database-harness';

it('preserves cancellation committed while prepared context waits for the run row', async () => {
	const owner = actor('9621');
	await new UserRecords(context.db).ensureLocal(owner);
	const conversation = await new ConversationRecords(context.db).insert(owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const { database, transactionRunner } = createTransactionContext(context.db);
	const runs = new AgentRunRecords(database);
	const preparation = new RunPreparation(runs);
	const run = await runs.insert(owner, {
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'running',
		requestId: crypto.randomUUID(),
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Prepare context' },
		createdAt: now,
		updatedAt: now,
		startedAt: now
	});
	if (run.kind !== 'agent') throw new Error('Expected a chat run');
	const [backend] = await context.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
	const competing = postgres(context.url, { max: 2 });
	const locked = Promise.withResolvers<void>();
	const cancel = Promise.withResolvers<void>();
	const cancellation = competing.begin(async (transaction) => {
		await transaction`select id from agent_runs where id = ${run.id} for update`;
		locked.resolve();
		await cancel.promise;
		await transaction`update agent_runs set status = 'cancelling', cancel_requested_at = ${now} where id = ${run.id}`;
	});
	try {
		await locked.promise;
		const saved = transactionRunner
			.run(async () => {
				const current = await preparation.getForWrite(owner, run.id);
				const change = preparation.context(
					current,
					{ contextNotes: [], skills: { items: [] } },
					now
				);
				return preparation.persistContext(owner, run.id, change);
			})
			.then(
				(value) => ({ kind: 'saved' as const, value }),
				(error) => ({ kind: 'failure' as const, error })
			);
		await vi.waitFor(async () => {
			const [activity] = await competing<
				{ wait_event_type: string | null }[]
			>`select wait_event_type from pg_stat_activity where pid = ${backend!.pid}`;
			if (activity?.wait_event_type !== 'Lock')
				throw new Error('Context save has not reached the locked row');
		});
		cancel.resolve();
		await cancellation;
		const result = await saved;
		expect({ status: (await runs.findById(owner, run.id))?.status, result: result.kind }).toEqual({
			status: 'cancelling',
			result: 'failure'
		});
	} finally {
		cancel.resolve();
		await cancellation;
		await competing.end();
	}
});
