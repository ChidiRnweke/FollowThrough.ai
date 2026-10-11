import type { ProvenanceId } from '$lib/models/provenance';
import { Memory, type MemoryDependencies } from '$lib/server/controllers/memory/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryTrustPolicyEvaluator } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const provenance = new ProvenanceRecords(owner, database);
	const origin = await provenance.insert({
		id: crypto.randomUUID() as ProvenanceId,
		userId: owner.userId,
		producerKind: 'agent',
		producerName: 'MCP client',
		pipeline: 'agent',
		metadata: { scope: 'full' },
		createdAt: now
	});
	const suggestions = new SuggestionRecords(owner, database);
	const inbox = createSuggestionServices(
		owner,
		suggestions,
		new NoteRecords(owner, database),
		provenance,
		new SourceAnchorRecords(owner, database)
	);
	const library = createMemoryServices(
		owner,
		new MemoryRecords(owner, database),
		new ProjectRecords(owner, database),
		provenance
	);
	const controller = new Memory(
		owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<MemoryDependencies>({
			...agentToolResultsFixture(),
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryChanges: library.changes,
			suggestionCreator: inbox.creator,
			trustPolicyEvaluator: new InMemoryTrustPolicyEvaluator(),
			transactionRunner
		})
	);
	return { owner, origin, controller, suggestions, provenance };
};
it('keeps the owned caller source and its recorded MCP scope', async () => {
	const { origin, controller, provenance } = await setup('22801');
	const result = await controller.propose({
		scope: 'user',
		operation: 'add',
		content: 'Prefer concise answers.',
		provenanceId: origin.id
	});
	expect(await provenance.findById(result.suggestion.provenanceId)).toEqual(origin);
});
it.each(['foreign', 'missing'] as const)(
	'refuses a %s source without persisting a proposal',
	async (kind) => {
		const { controller, suggestions } = await setup(kind === 'foreign' ? '22802' : '22803');
		let provenanceId: ProvenanceId;
		if (kind === 'foreign') {
			const foreign = await seedNote('22812');
			provenanceId = (await seedProvenance(foreign.owner, '22812')).id;
		} else provenanceId = crypto.randomUUID() as ProvenanceId;
		const outcome = await controller
			.propose({
				scope: 'user',
				operation: 'add',
				content: 'Prefer concise answers.',
				provenanceId
			})
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({ outcome, proposals: await suggestions.list({ status: 'proposed' }) }).toEqual({
			outcome: 'Suggestion provenance was not found',
			proposals: []
		});
	}
);
