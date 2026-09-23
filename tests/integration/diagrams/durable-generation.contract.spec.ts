import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { afterAll, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { Diagrams, type DiagramsDependencies } from '$lib/server/controllers/diagrams/controller';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSuggestionsCapability } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { type AgentRunId, type DiagramActionInput } from '$lib/models/agent';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
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
	const notes = createNotesCapability({ db: database, projects: new ProjectRecords(database) });
	const suggestions = createSuggestionsCapability({
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const text = 'Service A calls Service B';
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
	const fixture = diagramGenerationFixture();
	const runs = new AgentRunRecords(database);
	const events = new AgentRunEventRecords(database);
	const conversations = new ConversationRecords(database);
	const requests = new NoteActionRequests(runs, events, conversations);
	const settlements = new RunSettlements(runs, events);
	const dependencies = capabilityDependencies<DiagramsDependencies>({
		...fixture,
		generation: {
			...fixture.generation,
			contextNotes: notes.catalog,
			conversations: new ConversationArchive(conversations),
			runs: new AgentRunLedger(runs),
			runContext: new DiagramRunContext(runs),
			provenance: notes.provenance
		},
		transactionRunner,
		selectionOrigins: notes.selectionOrigins,
		drawioXmlValidator: new DrawioXmlValidator(),
		suggestionCreator: suggestions.inbox,
		noteActionRequests: requests,
		runSettlements: settlements,
		runEvents: { notify: () => {} }
	});
	const agent = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			cancellations: new RunCancellation(runs),
			events,
			decisions: new AgentRunDecisionRecords(database),
			settlements,
			transactionRunner,
			eventBus: { notify: () => {} }
		})
	);
	const prepare = (input: DiagramActionInput = { operation: 'generate', selection }) =>
		transactionRunner.run(() =>
			requests.prepare(seeded.owner, {
				requestId: crypto.randomUUID(),
				context: { kind: 'diagram_action', model: 'test/model', input }
			})
		);
	const finished = async (runId: AgentRunId) => {
		await vi.waitFor(async () => {
			const run = await runs.findById(seeded.owner, runId);
			if (!run || !isTerminalAgentRunStatus(run.status)) throw new Error('Diagram has not settled');
		});
	};
	return {
		...seeded,
		note,
		selection,
		runs,
		events,
		dependencies,
		agent,
		prepare,
		finished,
		provider: fixture.provider,
		models: fixture.models,
		controller: new Diagrams(dependencies)
	};
};

it('creates one diagram run and proposal for concurrent duplicate submissions', async () => {
	const state = await setup('13201');
	const input = { requestId: crypto.randomUUID(), selection: state.selection };
	const receipts = await Promise.all([
		state.controller.startGenerateMermaid(state.owner, input),
		state.controller.startGenerateMermaid(state.owner, input)
	]);
	await state.finished(receipts[0].runId);
	state.models.failure = new Error('Model catalog is offline');
	const repeated = await state.controller.startGenerateMermaid(state.owner, input);
	const [counts] =
		await context.client`select (select count(*)::int from agent_runs where user_id = ${state.owner.userId}) as runs, (select count(*)::int from conversations where user_id = ${state.owner.userId}) as conversations, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions`;
	expect({
		sameRun: receipts[0].runId === receipts[1].runId && repeated.runId === receipts[0].runId,
		status: repeated.status,
		counts
	}).toEqual({
		sameRun: true,
		status: 'completed',
		counts: { runs: 1, conversations: 1, suggestions: 1 }
	});
});

it('saves no diagram proposal after cancellation during provider execution', async () => {
	const state = await setup('13202');
	const receipt = await state.prepare();
	const gate = Promise.withResolvers<void>();
	state.provider.completion = gate.promise;
	const execution = state.controller.executeDiagramRun(state.owner, receipt.runId);
	try {
		await state.provider.started.promise;
		await state.agent.cancel(state.owner, receipt.runId);
	} finally {
		gate.resolve();
	}
	await execution;
	const [counts] =
		await context.client`select (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select count(*)::int from source_anchors where note_id = ${state.note.id}) as anchors`;
	expect({
		status: (await state.runs.findById(state.owner, receipt.runId))?.status,
		counts
	}).toEqual({ status: 'cancelled', counts: { suggestions: 0, anchors: 0 } });
});

it('rolls back the generated diagram when result-event storage fails', async () => {
	const state = await setup('13203');
	const receipt = await state.prepare();
	await context.client`alter table agent_run_events add constraint diagram_result_failure check (not (event->>'type' = 'workflow_result' and event->>'action' = 'diagram')) not valid`;
	try {
		await state.controller.executeDiagramRun(state.owner, receipt.runId);
		const [counts] =
			await context.client`select (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select count(*)::int from source_anchors where note_id = ${state.note.id}) as anchors`;
		expect({
			status: (await state.runs.findById(state.owner, receipt.runId))?.status,
			counts
		}).toEqual({ status: 'failed', counts: { suggestions: 0, anchors: 0 } });
	} finally {
		await context.client`alter table agent_run_events drop constraint diagram_result_failure`;
	}
});

it('resumes a queued draw.io conversion from its persisted source after reconstruction', async () => {
	const state = await setup('13204');
	const receipt = await state.prepare({
		operation: 'convert',
		noteId: state.note.id,
		source: 'flowchart LR\nA --> B'
	});
	await new Diagrams(state.dependencies).recoverQueuedDiagramRuns();
	await state.finished(receipt.runId);
	const rows =
		await context.client`select payload->>'kind' as kind from suggestions where user_id = ${state.owner.userId}`;
	expect({
		status: (await state.runs.findById(state.owner, receipt.runId))?.status,
		proposals: rows.map((row) => row.kind)
	}).toEqual({ status: 'completed', proposals: ['drawio'] });
});
