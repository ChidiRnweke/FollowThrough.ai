import { AgentSessionRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { AgentRunNotificationRecords } from '$lib/server/repositories/agent/postgres/run-notifications';
import { type AgentRunId } from '$lib/models/agent';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSuggestionsCapability } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { createTodosCapability } from '$lib/server/factories/capabilities/todos-capability-factory';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { AgentRunStatusService } from '$lib/services/agent/run-status';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import {
	InMemoryPromiseExtractor,
	InMemoryTrustPolicyEvaluator
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, expect, it, vi } from 'vitest';
import { context, seedNote, notifications } from '../database-harness';
const runStatus = new AgentRunStatusService();

const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});

const setup = async (suffix: string, text = 'I will send it soon.') => {
	const seeded = await seedNote(suffix);
	const client = postgres(context.url, { max: 4 });
	clients.push(client);
	const { database, transactionRunner } = createTransactionContext(drizzle(client, { schema }));
	const projects = new ProjectRecords(seeded.owner, database);
	const notes = createNotesCapability(seeded.owner, { db: database, projects });
	const todo = createTodosCapability(seeded.owner, {
		db: database,
		projects,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const suggestions = createSuggestionsCapability(seeded.owner, {
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const note = await saveNoteDraft(notes.services.authoring, transactionRunner, seeded.owner, {
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
	const runs = new AgentRunRecords(seeded.owner, database);
	const events = new AgentRunEventRecords(seeded.owner, database);
	const requests = new NoteActionRequests(
		seeded.owner,
		runs,
		events,
		new ConversationRecords(seeded.owner, database)
	);
	const settlements = new RunSettlements(runs, events);
	const extractor = new InMemoryPromiseExtractor();
	extractor.candidates = [
		{ action: 'Send it', responsibility: 'mine', strength: 'explicit', confidence: 95 }
	];
	const trust = new InMemoryTrustPolicyEvaluator();
	trust.autoAccept = true;
	const dependencies = capabilityDependencies<TodosDependencies>({
		...agentToolResultsFixture(),
		boardExport: new TodoBoardExportService(),
		todoPresentation: new TodoPresentationService(),
		todoEditingRules: new TodoEditingRulesService(),
		todoCreationRules: new TodoEditingRulesService(),
		transactionRunner,
		noteActionRequests: requests,
		promiseExtractor: extractor,
		promiseRules: todo.promiseRules,
		promiseGeneration: { kind: 'model', model: 'test/model' },
		runSettlements: settlements,
		runSignals: new RunSignalService(new AgentRunNotificationRecords(notifications), runs),
		selectionOrigins: notes.selectionOrigins,
		suggestionCreator: suggestions.creator,
		suggestionAccepter: suggestions.accepter,
		suggestionEffects: suggestions.effects,
		todoLibrary: todo.catalog,
		trustPolicyEvaluator: trust
	});
	const agent = new AgentSdkHarness(
		seeded.owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			records: new AgentRunHarnessRecords(
				runs,
				events,
				new AgentRunDecisionRecords(seeded.owner, database),
				new AgentSessionRecords(seeded.owner, database)
			),
			transitions: new RunTransitions(runs),
			settlements,
			transactionRunner,
			runSignals: new RunSignalService(new AgentRunNotificationRecords(notifications), runs)
		})
	);
	const controller = new Todos(seeded.owner, new WorkspaceCommandRulesService(), dependencies);
	const input = { requestId: crypto.randomUUID(), selection };
	const prepare = () =>
		transactionRunner.run(() =>
			requests.prepare({
				requestId: input.requestId,
				context: {
					kind: 'promise_extraction',
					selection: input.selection,
					generation: dependencies.promiseGeneration
				}
			})
		);
	const finished = async (runId: AgentRunId) => {
		await vi.waitFor(async () => {
			const run = await runs.findById(runId);
			if (!run || !runStatus.isTerminal(run.status)) throw new Error('Run has not settled');
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
		trust,
		agent,
		dependencies,
		controller,
		prepare,
		finished
	};
};

it.each([
	{ autoAccept: false, suffix: '20401' },
	{ autoAccept: true, suffix: '20402' }
])(
	'persists the waiting-on owner when automatic acceptance is $autoAccept',
	async ({ autoAccept, suffix }) => {
		const state = await setup(suffix, 'Maya will send the draft.');
		state.extractor.candidates = [
			{
				action: 'Send the draft',
				ownerName: 'Maya',
				responsibility: 'waiting_on',
				strength: 'explicit',
				confidence: 95
			}
		];
		state.trust.autoAccept = autoAccept;
		const receipt = await state.controller.startExtractPromises(state.input);
		await state.finished(receipt.runId);
		expect({
			run: (await state.runs.findById(receipt.runId))?.status,
			proposals:
				await context.client`select status, payload->>'waitingOn' as waiting_on from suggestions where user_id = ${state.owner.userId}`,
			tasks:
				await context.client`select waiting_on from todos where user_id = ${state.owner.userId}`
		}).toEqual({
			run: 'completed',
			proposals: [{ status: autoAccept ? 'accepted' : 'proposed', waiting_on: 'Maya' }],
			tasks: autoAccept ? [{ waiting_on: 'Maya' }] : []
		});
	}
);

it('commits one extraction for simultaneous duplicate submissions on separate connections', async () => {
	const state = await setup('12501');
	const [first, second] = await Promise.all([
		state.controller.startExtractPromises(state.input),
		state.controller.startExtractPromises(state.input)
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
	const execution = state.controller.executePromiseRun(receipt.runId);
	try {
		await state.extractor.started.promise;
		await state.agent.cancel(receipt.runId);
	} finally {
		gate.resolve();
	}
	await execution;
	const [counts] =
		await context.client`select (select count(*)::int from todos where user_id = ${state.owner.userId}) as todos, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select count(*)::int from source_anchors where note_id = ${state.note.id}) as anchors`;
	expect({
		status: (await state.runs.findById(receipt.runId))?.status,
		counts
	}).toEqual({ status: 'cancelled', counts: { todos: 0, suggestions: 0, anchors: 0 } });
});

it('rolls back accepted tasks when the database refuses the extraction result event', async () => {
	const state = await setup('12503');
	const receipt = await state.prepare();
	await context.client`alter table agent_run_events add constraint promise_result_failure check (event->>'type' <> 'workflow_result') not valid`;
	try {
		await state.controller.executePromiseRun(receipt.runId);
		const [counts] =
			await context.client`select (select count(*)::int from todos where user_id = ${state.owner.userId}) as todos, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions`;
		expect({
			status: (await state.runs.findById(receipt.runId))?.status,
			counts,
			events: (await state.events.replay(receipt.runId, '0')).map((record) =>
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
	await new Todos(
		state.owner,
		new WorkspaceCommandRulesService(),
		state.dependencies
	).resumeQueuedPromiseRun(receipt.runId);
	await state.finished(receipt.runId);
	expect(
		(await state.events.replay(receipt.runId, '0')).flatMap((record) =>
			record.kind === 'readable' && record.event.type === 'workflow_result'
				? [record.event.action]
				: []
		)
	).toEqual(['promises']);
});
