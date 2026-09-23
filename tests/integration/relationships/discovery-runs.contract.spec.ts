import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { storedNote } from '$lib/testing/notes/fixtures/stored-note';
import { afterAll, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import {
	Relationships,
	type RelationshipsDependencies
} from '$lib/server/controllers/relationships/controller';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import { RelationshipRules } from '$lib/server/services/relationships/rules';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import {
	InMemoryEmbeddingClient,
	InMemoryReranker
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
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
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { type AgentRunId } from '$lib/models/agent';
import { InMemoryStructuredRelationshipClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
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
	const suggestions = createSuggestionsCapability({
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const text = 'Use OAuth';
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
	const requests = new NoteActionRequests(runs, events, new ConversationRecords(database));
	const settlements = new RunSettlements(runs, events);
	const classifier = new InMemoryStructuredRelationshipClient();
	classifier.result = {
		kind: 'prior_decision',
		justification: 'An earlier project decision',
		confidence: 95
	};
	const targetText = 'The team chose OAuth.';
	const target = await storedNote(notes.catalog, seeded.owner, {
		kind: 'note',
		projectId: seeded.project.id,
		title: 'Earlier decision'
	});
	const savedTarget = await notes.catalog.save(seeded.owner, {
		...target,
		plainText: targetText,
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: targetText }] }]
		}
	});
	const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
	const index = new KnowledgeIndexRecords(database);
	await index.replaceForNote(seeded.owner, target.id, [
		searchDocumentBuilder({
			noteId: target.id,
			projectId: seeded.project.id,
			content: targetText,
			sourceRevision: savedTarget.currentRevision,
			embedding: vector,
			embeddingModel: 'contract-model'
		})
	]);
	const embeddings = new InMemoryEmbeddingClient();
	embeddings.model = 'contract-model';
	embeddings.vectorsByContent.set(text, vector);
	const dependencies: RelationshipsDependencies = {
		transactionRunner,
		noteActionRequests: requests,
		knowledgeLookup: new KnowledgeLookup(index),
		embeddings,
		reranker: new InMemoryReranker(),
		relationshipClassifier: new RelationshipDiscovery(classifier),
		relationshipRules: new RelationshipRules(),
		relationshipGeneration: { kind: 'model', model: 'test/model' },
		runSettlements: settlements,
		runEvents: { notify: () => {} },
		selectionOrigins: notes.selectionOrigins,
		suggestionCreator: suggestions.inbox
	};
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
	const controller = new Relationships(dependencies);
	const input = { requestId: crypto.randomUUID(), selection };
	const prepare = () =>
		transactionRunner.run(() =>
			requests.prepare(seeded.owner, {
				requestId: input.requestId,
				context: {
					kind: 'related_notes',
					selection: input.selection,
					generation: dependencies.relationshipGeneration
				}
			})
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
		classifier,
		agent,
		dependencies,
		controller,
		prepare,
		finished
	};
};

it('commits one related-note search for simultaneous duplicate submissions on separate connections', async () => {
	const state = await setup('13001');
	const [first, second] = await Promise.all([
		state.controller.startSuggestFromSelection(state.owner, state.input),
		state.controller.startSuggestFromSelection(state.owner, state.input)
	]);
	await state.finished(first.runId);
	const [counts] =
		await context.client`select (select count(*)::int from agent_runs where user_id = ${state.owner.userId}) as runs, (select count(*)::int from conversations where user_id = ${state.owner.userId}) as conversations, (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions`;
	expect({ sameRun: first.runId === second.runId, counts }).toEqual({
		sameRun: true,
		counts: { runs: 1, conversations: 1, suggestions: 1 }
	});
});

it('keeps the database free of proposals when cancellation beats the classifier result', async () => {
	const state = await setup('13002');
	const receipt = await state.prepare();
	const gate = Promise.withResolvers<void>();
	state.classifier.completion = gate.promise;
	const execution = state.controller.executeRelatedNoteRun(state.owner, receipt.runId);
	try {
		await state.classifier.started.promise;
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

it('rolls back backlink proposals and anchors when the result event fails', async () => {
	const state = await setup('13003');
	const receipt = await state.prepare();
	await context.client`alter table agent_run_events add constraint related_result_failure check (not (event->>'type' = 'workflow_result' and event->>'action' = 'relate')) not valid`;
	try {
		await state.controller.executeRelatedNoteRun(state.owner, receipt.runId);
		const [counts] =
			await context.client`select (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select count(*)::int from source_anchors where note_id = ${state.note.id}) as anchors`;
		expect({
			status: (await state.runs.findById(state.owner, receipt.runId))?.status,
			counts,
			events: (await state.events.replay(state.owner, receipt.runId, '0')).map((record) =>
				record.kind === 'readable' ? record.event.type : record.kind
			)
		}).toEqual({
			status: 'failed',
			counts: { suggestions: 0, anchors: 0 },
			events: ['run_queued', 'run_started', 'failed']
		});
	} finally {
		await context.client`alter table agent_run_events drop constraint related_result_failure`;
	}
});

it('reconstructs a queued related-note search after its submitting controller has been discarded', async () => {
	const state = await setup('13004');
	const receipt = await state.prepare();
	await new Relationships(state.dependencies).recoverQueuedRelatedNoteRuns();
	await state.finished(receipt.runId);
	expect(
		(await state.events.replay(state.owner, receipt.runId, '0')).flatMap((record) =>
			record.kind === 'readable' && record.event.type === 'workflow_result'
				? [record.event.action]
				: []
		)
	).toEqual(['relate']);
});
