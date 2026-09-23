import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { afterAll, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import {
	References,
	type ReferencesDependencies
} from '$lib/server/controllers/references/controller';
import { ReferenceRanking } from '$lib/server/services/references/ranking';
import type { Url } from '$lib/models/references';
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
import { InMemoryReferencePipeline } from '$lib/testing/relationships/fakes/in-memory-pipelines';
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
	const finder = new InMemoryReferencePipeline();
	finder.candidates = [
		{
			url: 'https://www.rfc-editor.org/rfc/rfc6749' as Url,
			title: 'OAuth standard',
			tier: 'standard',
			relevanceNote: 'Defines OAuth',
			confidence: 95
		}
	];
	const dependencies: ReferencesDependencies = {
		transactionRunner,
		noteActionRequests: requests,
		referenceFinder: finder,
		referenceRanker: new ReferenceRanking(),
		referenceModel: 'test/model',
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
	const controller = new References(dependencies);
	const input = { requestId: crypto.randomUUID(), selection };
	const prepare = () =>
		transactionRunner.run(() =>
			requests.prepare(seeded.owner, {
				requestId: input.requestId,
				context: {
					kind: 'reference_search',
					selection: input.selection,
					model: dependencies.referenceModel
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
		finder,
		agent,
		dependencies,
		controller,
		prepare,
		finished
	};
};

it('commits one reference search for simultaneous duplicate submissions on separate connections', async () => {
	const state = await setup('12901');
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

it('keeps the database free of proposals when cancellation beats the finder result', async () => {
	const state = await setup('12902');
	const receipt = await state.prepare();
	const gate = Promise.withResolvers<void>();
	state.finder.completion = gate.promise;
	const execution = state.controller.executeReferenceRun(state.owner, receipt.runId);
	try {
		await state.finder.started.promise;
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

it('rolls back reference proposals and anchors when the result event fails', async () => {
	const state = await setup('12903');
	const receipt = await state.prepare();
	await context.client`alter table agent_run_events add constraint reference_result_failure check (not (event->>'type' = 'workflow_result' and event->>'action' = 'reference')) not valid`;
	try {
		await state.controller.executeReferenceRun(state.owner, receipt.runId);
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
		await context.client`alter table agent_run_events drop constraint reference_result_failure`;
	}
});

it('reconstructs a queued reference search after its submitting controller has been discarded', async () => {
	const state = await setup('12904');
	const receipt = await state.prepare();
	await new References(state.dependencies).recoverQueuedReferenceRuns();
	await state.finished(receipt.runId);
	expect(
		(await state.events.replay(state.owner, receipt.runId, '0')).flatMap((record) =>
			record.kind === 'readable' && record.event.type === 'workflow_result'
				? [record.event.action]
				: []
		)
	).toEqual(['reference']);
});
