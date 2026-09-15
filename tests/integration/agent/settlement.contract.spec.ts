import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentRunEventRecords } from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { actor, context, now } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = actor(suffix);
	await new UserRecords(context.db).ensureLocal(owner);
	const transaction = createTransactionContext(context.db);
	const conversations = new ConversationRecords(transaction.database);
	const conversation = await conversations.insert(owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const runs = new AgentRunRecords(transaction.database);
	const events = new AgentRunEventRecords(transaction.database);
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
		inputSnapshot: { conversationId: conversation.id, prompt: 'Settlement contract' },
		createdAt: now,
		updatedAt: now
	});
	return {
		owner,
		runs,
		events,
		run,
		settlements: new RunSettlements(runs, events, transaction.transactionRunner)
	};
};
describe('atomic execution settlement', () => {
	it('records one completion when competing workers settle the same run', async () => {
		const { owner, runs, events, run, settlements } = await setup('9611');
		const outcome = {
			kind: 'completed' as const,
			conversationId: run.conversationId,
			model: run.model
		};
		await Promise.all([
			settlements.settle(run.id, outcome, async () => {}),
			settlements.settle(run.id, outcome, async () => {})
		]);
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: (await events.replay(owner, run.id, '0')).map((record) => record.event.type)
		}).toEqual({ status: 'completed', events: ['completed'] });
	});
	it('publishes only cancellation after cancellation wins against workflow completion', async () => {
		const { owner, runs, events, run, settlements } = await setup('9612');
		await runs.requestCancellation(owner, run.id, now);
		await Promise.all([
			settlements.settle(
				run.id,
				{
					kind: 'workflow_completed',
					conversationId: run.conversationId,
					model: run.model,
					action: 'diagram',
					result: 'discard'
				},
				async () => {}
			),
			settlements.settle(
				run.id,
				{ kind: 'cancelled', message: 'Generation stopped' },
				async () => {}
			)
		]);
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: (await events.replay(owner, run.id, '0')).map((record) => record.event.type)
		}).toEqual({ status: 'cancelled', events: ['cancelled'] });
	});
	it('rolls back the state and journal if materialization fails', async () => {
		const { owner, runs, events, run, settlements } = await setup('9613');
		await settlements
			.settle(
				run.id,
				{ kind: 'completed', conversationId: run.conversationId, model: run.model },
				async () => {
					await events.append(run.id, 1, { type: 'text_delta', text: 'uncommitted' });
					throw new Error('Session persistence failed');
				}
			)
			.then(
				() => {
					throw new Error('Expected materialization failure');
				},
				(error) => {
					if (!(error instanceof Error) || error.message !== 'Session persistence failed')
						throw error;
				}
			);
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: await events.replay(owner, run.id, '0')
		}).toEqual({ status: 'running', events: [] });
	});
});
