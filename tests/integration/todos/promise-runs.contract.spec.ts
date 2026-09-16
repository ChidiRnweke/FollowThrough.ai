import { afterAll, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createTodosCapability } from '$lib/server/factories/capabilities/todos-capability-factory';
import { createSuggestionsCapability } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { PromiseRequests } from '$lib/server/services/agent/runs/promise-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { isTerminalAgentRunStatus, type AgentRunId } from '$lib/models/agent';
import {
	InMemoryPromiseExtractor,
	InMemoryTrustPolicyEvaluator
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const client = postgres(context.url, { max: 4 });
	clients.push(client);
	const { database, transactionRunner } = createTransactionContext(drizzle(client, { schema }));
	const projects = new ProjectRecords(database);
	const notes = createNotesCapability({ db: database, projects });
	const todo = createTodosCapability({
		db: database,
		projects,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const suggestions = createSuggestionsCapability({
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const text = 'I will send it soon.';
	const note = await notes.catalog.save(seeded.owner, {
		...seeded.note,
		plainText: text,
		document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
	});
	const selection = {
		noteId: note.id,
		revision: note.currentRevision,
		from: 0,
		to: text.length,
		text
	};
	const runs = new AgentRunRecords(database);
	const events = new AgentRunEventRecords(database);
	const requests = new PromiseRequests(runs, events, new ConversationRecords(database));
	const settlements = new RunSettlements(runs, events);
	const extractor = new InMemoryPromiseExtractor();
	extractor.candidates = [
		{ action: 'Send it', responsibility: 'mine', strength: 'explicit', confidence: 95 }
	];
	const trust = new InMemoryTrustPolicyEvaluator();
	trust.autoAccept = true;
	const dependencies = capabilityDependencies<TodosDependencies>({
		transactionRunner,
		promiseRequests: requests,
		promiseExtractor: extractor,
		promiseRules: todo.promiseRules,
		promiseGeneration: { kind: 'model', model: 'test/model' },
		runSettlements: settlements,
		runEvents: { notify: () => {} },
		selectionOrigins: notes.selectionOrigins,
		suggestionCreator: suggestions.inbox,
		suggestionAccepter: suggestions.inbox,
		suggestionEffects: suggestions.effects,
		todoCreator: todo.catalog,
		trustPolicyEvaluator: trust
	});
	const agent = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			events,
			decisions: new AgentRunDecisionRecords(database),
			settlements,
			transactionRunner,
			eventBus: { notify: () => {} }
		})
	);
	const controller = new Todos(dependencies);
	const input = { requestId: crypto.randomUUID(), selection };
	const prepare = () =>
		transactionRunner.run(() =>
			requests.prepare(seeded.owner, input, dependencies.promiseGeneration)
		);
	const finished = async (runId: AgentRunId) => {
		await vi.waitFor(async () => {
			const run = await runs.findById(seeded.owner, runId);
			if (!run || !isTerminalAgentRunStatus(run.status)) throw new Error('Run has not settled');
		});
	};
	return {
		...seeded,
		note,
		input,
		runs,
		events,
		requests,
		extractor,
		agent,
		dependencies,
		controller,
		prepare,
		finished
	};
};

it('commits one extraction for simultaneous duplicate submissions on separate connections', async () => {
	const state = await setup('12501');
	const [first, second] = await Promise.all([
		state.controller.startExtractPromises(state.owner, state.input),
		state.controller.startExtractPromises(state.owner, state.input)
	]);
	await state.finished(first.runId);
	const [counts] =
		await context.client`select (select count(*)::int from agent_runs where user_id = ${state.owner.userId}) as runs, (select count(*)::int from conversations where user_id = ${state.owner.userId}) as conversations, (select count(*)::int from todos where user_id = ${state.owner.userId}) as todos`;
	expect({ sameRun: first.runId === second.runId, counts }).toEqual({
		sameRun: true,
		counts: { runs: 1, conversations: 1, todos: 1 }
	});
});

it('keeps the database free of proposals when cancellation beats the extractor result', async () => {
	const state = await setup('12502');
	const receipt = await state.prepare();
	const gate = Promise.withResolvers<void>();
	state.extractor.completion = gate.promise;
	const execution = state.controller.executePromiseRun(state.owner, receipt.runId);
	try {
		await state.extractor.started.promise;
		await state.agent.cancel(state.owner, receipt.runId);
	} finally {
		gate.resolve();
	}
	await execution;
	const [counts] =
		await context.client`select (select count(*)::int from todos where user_id = ${state.owner.userId}) as todos, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select count(*)::int from source_anchors where note_id = ${state.note.id}) as anchors`;
	expect({
		status: (await state.runs.findById(state.owner, receipt.runId))?.status,
		counts
	}).toEqual({ status: 'cancelled', counts: { todos: 0, suggestions: 0, anchors: 0 } });
});

it('rolls back accepted tasks when the database refuses the extraction result event', async () => {
	const state = await setup('12503');
	const receipt = await state.prepare();
	await context.client`alter table agent_run_events add constraint promise_result_failure check (event->>'type' <> 'workflow_result') not valid`;
	try {
		await state.controller.executePromiseRun(state.owner, receipt.runId);
		const [counts] =
			await context.client`select (select count(*)::int from todos where user_id = ${state.owner.userId}) as todos, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions`;
		expect({
			status: (await state.runs.findById(state.owner, receipt.runId))?.status,
			counts,
			events: (await state.events.replay(state.owner, receipt.runId, '0')).map((record) =>
				record.kind === 'readable' ? record.event.type : record.kind
			)
		}).toEqual({
			status: 'failed',
			counts: { todos: 0, suggestions: 0 },
			events: ['run_queued', 'run_started', 'failed']
		});
	} finally {
		await context.client`alter table agent_run_events drop constraint promise_result_failure`;
	}
});

it('reconstructs a queued extraction after the submitting controller has been discarded', async () => {
	const state = await setup('12504');
	const receipt = await state.prepare();
	await new Todos(state.dependencies).recoverQueuedPromiseRuns();
	await state.finished(receipt.runId);
	expect(
		(await state.events.replay(state.owner, receipt.runId, '0')).flatMap((record) =>
			record.kind === 'readable' && record.event.type === 'workflow_result'
				? [record.event.action]
				: []
		)
	).toEqual(['promises']);
});
