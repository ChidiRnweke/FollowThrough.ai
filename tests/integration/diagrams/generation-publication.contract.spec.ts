import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { isPermanentWriteConstraint } from '$lib/server/db/postgres-errors';
import { Diagrams, type DiagramsDependencies } from '$lib/server/controllers/diagrams/controller';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSuggestionsCapability } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';
import type { AgentRunId } from '$lib/models/agent';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import {
	AgentRunEventRecords,
	AgentRunDecisionRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const notes = createNotesCapability({ db: database, projects: new ProjectRecords(database) });
	const suggestions = createSuggestionsCapability({
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const fixture = diagramGenerationFixture();
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			...fixture,
			generation: {
				...fixture.generation,
				contextNotes: notes.catalog,
				conversations: new ConversationArchive(new ConversationRecords(database)),
				runs: new AgentRunLedger(new AgentRunRecords(database)),
				runContext: new DiagramRunContext(new AgentRunRecords(database)),
				provenance: notes.provenance
			},
			transactionRunner,
			drawioXmlValidator: new DrawioXmlValidator(),
			suggestionCreator: suggestions.inbox
		})
	);
	return { ...seeded, controller, provider: fixture.provider };
};

it('rolls back conversation creation when the direct run cannot be inserted', async () => {
	const state = await setup('17401');
	await context.client`alter table agent_runs add constraint reject_direct_run_test check (user_id <> '10000000-0000-4000-8000-000000017401') not valid`;
	try {
		const result = await state.controller
			.convertInlineMermaid(state.owner, { noteId: state.note.id, source: 'flowchart LR\nA --> B' })
			.catch((error) => {
				if (!isPermanentWriteConstraint(error)) throw error;
				return { kind: 'failure' as const };
			});
		const [counts] =
			await context.client`select (select count(*)::int from conversations where user_id = ${state.owner.userId}) as conversations, (select count(*)::int from agent_runs where user_id = ${state.owner.userId}) as runs`;
		expect({ failed: 'kind' in result && result.kind === 'failure', counts }).toEqual({
			failed: true,
			counts: { conversations: 0, runs: 0 }
		});
	} finally {
		await context.client`alter table agent_runs drop constraint reject_direct_run_test`;
	}
});

it('does not publish a direct result after cancellation settles its run', async () => {
	const state = await setup('17402');
	const gate = Promise.withResolvers<void>();
	state.provider.completion = gate.promise;
	const execution = state.controller
		.convertInlineMermaid(state.owner, { noteId: state.note.id, source: 'flowchart LR\nA --> B' })
		.catch((error) => {
			if (!(error instanceof Error) || error.message !== 'The workflow run is no longer running')
				throw error;
			return { kind: 'failure' as const };
		});
	try {
		await state.provider.started.promise;
		const [run] = await context.client<
			{ id: AgentRunId }[]
		>`select id from agent_runs where user_id = ${state.owner.userId}`;
		if (!run) throw new Error('Direct diagram run was not created');
		const { database, transactionRunner } = createTransactionContext(context.db);
		const runs = new AgentRunRecords(database);
		const events = new AgentRunEventRecords(database);
		const agent = new Agent(
			capabilityDependencies<AgentDependencies>({
				runs,
				events,
				transactionRunner,
				cancellations: new RunCancellation(runs),
				settlements: new RunSettlements(runs, events),
				decisions: new AgentRunDecisionRecords(database),
				eventBus: { notify: () => {} }
			})
		);
		await agent.cancel(state.owner, run.id);
	} finally {
		gate.resolve();
	}
	await execution;
	const [result] =
		await context.client`select (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select status from agent_runs where user_id = ${state.owner.userId}) as status`;
	expect(result).toEqual({ suggestions: 0, status: 'cancelled' });
});

it('records failed generation when proposal storage rejects the generated diagram', async () => {
	const state = await setup('13101');
	await context.client`alter table suggestions add constraint reject_diagram_proposal_test check (user_id <> '10000000-0000-4000-8000-000000013101') not valid`;
	try {
		await state.controller
			.convertInlineMermaid(state.owner, {
				noteId: state.note.id,
				source: 'flowchart LR\nA --> B'
			})
			.catch(() => undefined);
		const rows =
			await context.client`select status from agent_runs where user_id = ${state.owner.userId}`;
		expect(rows.map((row) => row.status)).toEqual(['failed']);
	} finally {
		await context.client`alter table suggestions drop constraint reject_diagram_proposal_test`;
	}
});

it('rolls back the diagram proposal when completion cannot be saved', async () => {
	const state = await setup('13102');
	await context.client`alter table agent_runs add constraint reject_diagram_completion_test check (user_id <> '10000000-0000-4000-8000-000000013102' or status <> 'completed') not valid`;
	try {
		await state.controller
			.convertInlineMermaid(state.owner, {
				noteId: state.note.id,
				source: 'flowchart LR\nA --> B'
			})
			.catch(() => undefined);
		const [result] =
			await context.client`select (select count(*)::int from suggestions where user_id = ${state.owner.userId}) as suggestions, (select status from agent_runs where user_id = ${state.owner.userId}) as status`;
		expect(result).toEqual({ suggestions: 0, status: 'failed' });
	} finally {
		await context.client`alter table agent_runs drop constraint reject_diagram_completion_test`;
	}
});
