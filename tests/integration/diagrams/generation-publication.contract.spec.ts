import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
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
				provenance: notes.provenance
			},
			transactionRunner,
			drawioXmlValidator: new DrawioXmlValidator(),
			suggestionCreator: suggestions.inbox
		})
	);
	return { ...seeded, controller };
};

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
