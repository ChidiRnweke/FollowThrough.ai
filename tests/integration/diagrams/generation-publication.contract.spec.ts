import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { InMemoryMermaidDocuments } from '$lib/testing/diagrams/fakes/mermaid-documents';
import { AgentRunNotificationRecords } from '$lib/server/repositories/agent/postgres/run-notifications';
import { DomainError } from '$lib/errors';
import type { AgentRunId } from '$lib/models/agent';
import type { DiagramId } from '$lib/models/diagrams';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { Diagrams, type DiagramsDependencies } from '$lib/server/controllers/diagrams/controller';
import { isPermanentWriteConstraint } from '$lib/server/db/postgres-errors';
import {
	connectPostgresTestDatabase,
	type PostgresDatabaseContext
} from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { DiagramLibraryService } from '$lib/server/services/diagrams/library';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSuggestionsCapability } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { DrawioDocumentService } from '$lib/server/services/diagrams/drawio';
import { DiagramGenerationRuleService } from '$lib/server/services/diagrams/generation-rules';
import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import postgres from 'postgres';
import { expect, it, vi } from 'vitest';
import { context, seedNote, notifications } from '../database-harness';

const setup = async (suffix: string, connection: PostgresDatabaseContext = context) => {
	const seeded = await seedNote(suffix);
	const actor = seeded.owner;
	const { database, transactionRunner } = createTransactionContext(connection.db);
	const notes = createNotesCapability(actor, {
		db: database,
		projects: new ProjectRecords(actor, database)
	});
	const suggestions = createSuggestionsCapability(actor, {
		db: database,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const fixture = diagramGenerationFixture();
	const records = new DiagramRecords(actor, database);
	const library = new DiagramLibraryService(
		actor,
		records,
		notes.repository,
		notes.anchors,
		notes.provenanceRepository,
		new ProjectRecords(actor, database)
	);
	const diagrams = new InMemoryDiagrams(actor);
	const controller = new Diagrams(
		actor,
		capabilityDependencies<DiagramsDependencies>({
			...agentToolResultsFixture(),
			generationRules: new DiagramGenerationRuleService(),
			...fixture,
			diagrams: library,
			diagramSourceNotes: notes.services.library,
			mermaid: new InMemoryMermaidDocuments(),
			diagramIndexer: diagrams,
			generation: {
				...fixture.generation,
				contextNotes: notes.services.library,
				conversations: new ConversationArchive(actor, new ConversationRecords(actor, database)),
				conversationMessages: new ConversationArchive(
					actor,
					new ConversationRecords(actor, database)
				),
				runs: new AgentRunLedger(actor, new AgentRunRecords(actor, database)),
				runContext: new DiagramRunContext(new AgentRunRecords(actor, database)),
				provenance: notes.provenance
			},
			transactionRunner,
			drawio: new DrawioDocumentService(),
			suggestionCreator: suggestions.creator,
			runSignals: new RunSignalService(
				new AgentRunNotificationRecords(notifications),
				new AgentRunRecords(actor, database)
			),
			runSettlements: new RunSettlements(
				new AgentRunRecords(actor, database),
				new AgentRunEventRecords(actor, database)
			)
		})
	);
	return { ...seeded, controller, provider: fixture.provider, records };
};

it.each([
	{ change: 'edit', suffix: '18601', code: 'STALE_REVISION' },
	{ change: 'archive', suffix: '18602', code: 'VALIDATION' }
])(
	'waits for a peer $change before publishing a Mermaid revision',
	async ({ change, suffix, code }) => {
		const writer = connectPostgresTestDatabase(context.url);
		const blocker = postgres(context.url, { max: 2 });
		const release = Promise.withResolvers<void>();
		const generated = Promise.withResolvers<void>();
		try {
			const state = await setup(suffix, writer);
			const diagram = await state.records.insert(
				mermaidBuilder({
					id: crypto.randomUUID() as DiagramId,
					userId: state.owner.userId,
					projectId: state.project.id,
					sourceNoteId: state.note.id,
					provenanceId: undefined
				})
			);
			state.provider.completion = generated.promise;
			const execution = state.controller
				.reviseMermaid({ diagramId: diagram.id, instruction: 'add queue' })
				.then(
					() => 'saved',
					(error) => {
						if (!(error instanceof DomainError)) throw error;
						return error.code;
					}
				);
			await state.provider.started.promise;
			const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
			const locked = Promise.withResolvers<void>();
			const peer = blocker.begin(async (transaction) => {
				if (change === 'edit')
					await transaction`update diagrams set source = 'flowchart LR\nPeer --> Edit' where id = ${diagram.id}`;
				else await transaction`update diagrams set archived_at = now() where id = ${diagram.id}`;
				locked.resolve();
				await release.promise;
			});
			try {
				await locked.promise;
				generated.resolve();
				await vi.waitFor(async () => {
					const waiting =
						await blocker`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
					if (waiting.length !== 1)
						throw new Error('Publication has not reached the locked diagram');
				});
				release.resolve();
				await peer;
				const outcome = await execution;
				const current = await state.records.findById(diagram.id);
				const [run] =
					await writer.client`select status from agent_runs where user_id = ${state.owner.userId}`;
				expect({
					outcome,
					source: current?.source,
					archived: Boolean(current?.archivedAt),
					status: run?.status
				}).toEqual({
					outcome: code,
					source: change === 'edit' ? 'flowchart LR\nPeer --> Edit' : diagram.source,
					archived: change === 'archive',
					status: 'failed'
				});
			} finally {
				release.resolve();
				await peer;
				await execution;
			}
		} finally {
			release.resolve();
			generated.resolve();
			await Promise.all([writer.close(), blocker.end()]);
		}
	}
);

it('persists the provenance of a generated Mermaid revision', async () => {
	const state = await setup('18801');
	const diagram = await state.records.insert(
		mermaidBuilder({
			id: crypto.randomUUID() as DiagramId,
			userId: state.owner.userId,
			projectId: state.project.id,
			sourceNoteId: state.note.id,
			provenanceId: undefined
		})
	);
	const result = await state.controller.reviseMermaid({
		diagramId: diagram.id,
		instruction: 'add queue'
	});
	const [provenance] = await context.client<
		{ id: string }[]
	>`select id from provenance where user_id = ${state.owner.userId}`;
	if (!provenance) throw new Error('Generation provenance was not recorded');
	const saved = await state.records.findById(diagram.id);
	expect({ returned: result.diagram.provenanceId, stored: saved?.provenanceId }).toEqual({
		returned: provenance.id,
		stored: provenance.id
	});
});

it('rolls back conversation creation when the direct run cannot be inserted', async () => {
	const state = await setup('17401');
	await context.client`alter table agent_runs add constraint reject_direct_run_test check (user_id <> '10000000-0000-4000-8000-000000017401') not valid`;
	try {
		const result = await state.controller
			.convertInlineMermaid({ noteId: state.note.id, source: 'flowchart LR\nA --> B' })
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
		.convertInlineMermaid({ noteId: state.note.id, source: 'flowchart LR\nA --> B' })
		.catch((error) => {
			// The cancel either aborts the generation or, if the provider finished first, refuses
			// to complete a run that is no longer running. Neither publishes a diagram.
			const stopped =
				error instanceof Error &&
				(error.name === 'AbortError' || error.message === 'The workflow run is no longer running');
			if (!stopped) throw error;
			return { kind: 'failure' as const };
		});
	try {
		await state.provider.started.promise;
		const [run] = await context.client<
			{ id: AgentRunId }[]
		>`select id from agent_runs where user_id = ${state.owner.userId}`;
		if (!run) throw new Error('Direct diagram run was not created');
		const { database, transactionRunner } = createTransactionContext(context.db);
		const runs = new AgentRunRecords(state.owner, database);
		const events = new AgentRunEventRecords(state.owner, database);
		const agent = new AgentSdkHarness(
			state.owner,
			new WorkspaceCommandRulesService(),
			capabilityDependencies<AgentHarnessDependencies>({
				...agentRulesFixture(),
				runs,
				events,
				transactionRunner,
				cancellations: new RunCancellation(runs),
				settlements: new RunSettlements(runs, events),
				decisions: new AgentRunDecisionRecords(state.owner, database),
				runSignals: new RunSignalService(new AgentRunNotificationRecords(notifications), runs)
			})
		);
		await agent.cancel(run.id);
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
			.convertInlineMermaid({
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
			.convertInlineMermaid({
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
