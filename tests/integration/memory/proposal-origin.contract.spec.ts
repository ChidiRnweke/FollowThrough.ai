import { expect, it } from 'vitest';
import type { ProvenanceId } from '$lib/models/provenance';
import { Memory, type MemoryDependencies } from '$lib/server/controllers/memory/controller';
import { MemoryLibrary } from '$lib/server/services/memory/library';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTrustPolicyEvaluator } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const provenance = new ProvenanceRecords(database);
	const origin = await provenance.insert(owner, {
		id: crypto.randomUUID() as ProvenanceId,
		userId: owner.userId,
		producerKind: 'agent',
		producerName: 'MCP client',
		pipeline: 'agent',
		metadata: { scope: 'full' },
		createdAt: now
	});
	const suggestions = new SuggestionRecords(database);
	const inbox = new SuggestionInbox(
		suggestions,
		new NoteRecords(database),
		provenance,
		new SourceAnchorRecords(database)
	);
	const library = new MemoryLibrary(
		new MemoryRecords(database),
		new ProjectRecords(database),
		provenance
	);
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryChanges: library,
			suggestionCreator: inbox,
			trustPolicyEvaluator: new InMemoryTrustPolicyEvaluator(),
			transactionRunner
		})
	);
	return { owner, origin, controller, suggestions, provenance };
};
it('keeps the owned caller source and its recorded MCP scope', async () => {
	const { owner, origin, controller, provenance } = await setup('22801');
	const result = await controller.propose(owner, {
		scope: 'user',
		operation: 'add',
		content: 'Prefer concise answers.',
		provenanceId: origin.id
	});
	expect(await provenance.findById(owner, result.suggestion.provenanceId)).toEqual(origin);
});
it.each(['foreign', 'missing'] as const)(
	'refuses a %s source without persisting a proposal',
	async (kind) => {
		const { owner, controller, suggestions } = await setup(kind === 'foreign' ? '22802' : '22803');
		let provenanceId: ProvenanceId;
		if (kind === 'foreign') {
			const foreign = await seedNote('22812');
			provenanceId = (await seedProvenance(foreign.owner, '22812')).id;
		} else provenanceId = crypto.randomUUID() as ProvenanceId;
		const outcome = await controller
			.propose(owner, {
				scope: 'user',
				operation: 'add',
				content: 'Prefer concise answers.',
				provenanceId
			})
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({ outcome, proposals: await suggestions.list(owner, { status: 'proposed' }) }).toEqual({
			outcome: 'Suggestion provenance was not found',
			proposals: []
		});
	}
);
