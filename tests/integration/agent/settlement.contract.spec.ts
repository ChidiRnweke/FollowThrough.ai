import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, PersistedSessionItem } from '$lib/models/agent';
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
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { InMemoryAgentRunner } from '$lib/testing/agent/fakes/in-memory-agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedProvenance } from '../database-harness';

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
	const sessions = new AgentSessionRecords(transaction.database);
	const provenance = await seedProvenance(owner, suffix);
	const run = await runs.insert(owner, {
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: `settlement-contract-${suffix}`,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Settlement contract' },
		contextSnapshot: { contextNotes: [], skills: { items: [] } },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
	const runner = new InMemoryAgentRunner();
	runner.events = [{ type: 'text_delta', text: 'Done' }];
	const controller = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			cancellations: new RunCancellation(runs),
			events,
			sessions,
			transactionRunner: transaction.transactionRunner,
			decisions: new AgentRunDecisionRecords(transaction.database),
			settlements: new RunSettlements(runs, events),
			conversationJournal: new ConversationArchive(conversations),
			runner,
			eventBus: { notify: () => {} }
		})
	);
	return {
		owner,
		runs,
		events,
		sessions,
		run,
		runner,
		controller,
		conversations,
		transactionRunner: transaction.transactionRunner
	};
};

describe('atomic execution settlement', () => {
	it('records one completion when competing workers execute the same run', async () => {
		const { owner, runs, events, run, controller, conversations } = await setup('9611');
		await Promise.all([
			controller.execute(run.id, new AbortController().signal),
			controller.execute(run.id, new AbortController().signal)
		]);
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: (await events.replay(owner, run.id, '0')).map((record) =>
				record.kind === 'readable' ? record.event.type : record.kind
			),
			messages: (await conversations.listMessages(owner, run.conversationId)).length
		}).toEqual({
			status: 'completed',
			events: ['run_started', 'text_delta', 'completed'],
			messages: 1
		});
	});
	it('publishes only cancellation after cancellation wins against execution', async () => {
		const { owner, runs, events, run, runner, controller, transactionRunner } = await setup('9612');
		runner.events = [];
		const completion = Promise.withResolvers<void>();
		runner.completion = completion.promise;
		const execution = controller.execute(run.id, new AbortController().signal);
		await runner.started.promise;
		await transactionRunner.run(async () => {
			const cancellations = new RunCancellation(runs);
			const current = await cancellations.getForWrite(owner, run.id);
			const change = cancellations.plan(current.status, now);
			if (!change) throw new Error('Expected an active run');
			await cancellations.persist(owner, run.id, change);
		});
		completion.resolve();
		await Promise.all([execution, controller.finishCancellation(run.id)]);
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: (await events.replay(owner, run.id, '0')).map((record) =>
				record.kind === 'readable' ? record.event.type : record.kind
			)
		}).toEqual({ status: 'cancelled', events: ['run_started', 'cancelled'] });
	});
	it('rolls back completion, session replacement and saved messages when the terminal event fails', async () => {
		const { owner, runs, events, sessions, run, controller, conversations } = await setup('9613');
		const original: PersistedSessionItem = {
			type: 'user_message',
			content: 'Original request'
		};
		await sessions.append(owner, run.conversationId, [original]);
		await context.client`create function reject_contract_completion() returns trigger language plpgsql as $$
		begin
			if NEW.event->>'type' = 'completed' and exists (
				select 1 from agent_runs where id = NEW.run_id and request_id = 'settlement-contract-9613'
			) then raise exception 'Terminal event storage failed'; end if;
			return NEW;
		end $$`;
		await context.client`create trigger reject_contract_completion before insert on agent_run_events
			for each row execute function reject_contract_completion()`;
		try {
			await controller.execute(run.id, new AbortController().signal).then(
				() => {
					throw new Error('Expected terminal event failure');
				},
				(error) => {
					if (
						!(error instanceof Error) ||
						!(error.cause instanceof Error) ||
						!error.cause.message.includes('Terminal event storage failed')
					)
						throw error;
				}
			);
		} finally {
			await context.client`drop trigger reject_contract_completion on agent_run_events`;
			await context.client`drop function reject_contract_completion()`;
		}
		expect({
			status: (await runs.findById(owner, run.id))?.status,
			events: (await events.replay(owner, run.id, '0')).map((record) =>
				record.kind === 'readable' ? record.event.type : record.kind
			),
			session: (await sessions.list(owner, run.conversationId)).map((row) => row.item),
			messages: await conversations.listMessages(owner, run.conversationId)
		}).toEqual({
			status: 'running',
			events: ['run_started', 'text_delta'],
			session: [original],
			messages: []
		});
	});
});
