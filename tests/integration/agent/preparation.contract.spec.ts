import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { isPermanentWriteConstraint } from '$lib/server/db/postgres-errors';
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
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryGatedMemoryEntries } from '$lib/testing/memory/fakes/in-memory-gated-memory';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedProvenance } from '../database-harness';

const setup = async (
	suffix: string,
	memory: InMemoryMemoryEntryRepository = new InMemoryMemoryEntryRepository(actor(suffix))
) => {
	const owner = actor(suffix);
	await new UserRecords(owner, context.db).ensureLocal();
	const { database, transactionRunner } = createTransactionContext(context.db);
	const conversations = new ConversationRecords(owner, database);
	const conversation = await conversations.insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const runs = new AgentRunRecords(owner, database);
	const events = new AgentRunEventRecords(owner, database);
	const provenance = await seedProvenance(owner, suffix);
	const run = await runs.insert({
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'test/model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: `preparation-contract-${suffix}`,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Prepare context' },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
	const fixture = agentContextFixture();
	const controller = new AgentSdkHarness(
		owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			...fixture.dependencies,
			records: new AgentRunHarnessRecords(
				runs,
				events,
				new AgentRunDecisionRecords(owner, database),
				new AgentSessionRecords(owner, database)
			),
			transitions: new RunTransitions(runs),
			transactionRunner,
			contextMemory: memory,
			settlements: new RunSettlements(runs, events),
			conversationMessages: new ConversationArchive(owner, conversations),
			conversationSessions: new ConversationArchive(owner, conversations)
		})
	);
	return { owner, run, runs, events, controller };
};

it('rolls back prepared context with a rejected start event before recording failure', async () => {
	const state = await setup('17501');
	await context.client`create function reject_contract_start() returns trigger language plpgsql as $$
 begin
  if NEW.event->>'type' = 'run_started' and exists (
   select 1 from agent_runs where id = NEW.run_id and request_id = 'preparation-contract-17501'
  ) then raise exception 'Start event rejected' using errcode = '23514'; end if;
  return NEW;
 end $$`;
	await context.client`create trigger reject_contract_start before insert on agent_run_events for each row execute function reject_contract_start()`;
	try {
		await state.controller
			.execute(state.run.id, new AbortController().signal)
			.catch(async (error) => {
				if (!(error instanceof Error) || !isPermanentWriteConstraint(error)) throw error;
				await state.controller.failRun(state.run.id, error);
				return { kind: 'failure' as const };
			});
		const run = await state.runs.findById(state.run.id);
		const events = await state.events.replay(state.run.id, '0');
		expect({
			status: run?.status,
			context: run?.contextSnapshot,
			events: events.map((record) => (record.kind === 'readable' ? record.event.type : record.kind))
		}).toEqual({ status: 'failed', context: undefined, events: ['failed'] });
	} finally {
		await context.client`drop trigger reject_contract_start on agent_run_events`;
		await context.client`drop function reject_contract_start()`;
	}
});

it('does not start a run cancelled by another execution while its context was loading', async () => {
	const memory = new InMemoryGatedMemoryEntries(actor('17502'));
	const state = await setup('17502', memory);
	const execution = state.controller.execute(state.run.id, new AbortController().signal);
	try {
		await memory.started;
		await state.controller.cancel(state.run.id);
	} finally {
		memory.release();
	}
	const outcome = await execution;
	const run = await state.runs.findById(state.run.id);
	const events = await state.events.replay(state.run.id, '0');
	expect({
		outcome,
		status: run?.status,
		context: run?.contextSnapshot,
		events: events.map((record) => (record.kind === 'readable' ? record.event.type : record.kind))
	}).toEqual({
		outcome: 'cancelled',
		status: 'cancelled',
		context: undefined,
		events: ['cancelled']
	});
});
