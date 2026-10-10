import type { MemoryEntryId } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { RelationshipId } from '$lib/models/relationships';
import {
	Suggestions,
	type SuggestionsDependencies
} from '$lib/server/controllers/suggestions/controller';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const application = (
	transaction: ReturnType<typeof createTransactionContext<typeof context.db>>
) => {
	const { database, transactionRunner } = transaction;
	const suggestions = new SuggestionRecords(database);
	const notes = new NoteRecords(database);
	const provenance = new ProvenanceRecords(database);
	const anchors = new SourceAnchorRecords(database);
	const inbox = createSuggestionServices(suggestions, notes, provenance, anchors);
	const repository = new SuggestionEffectRecords(database);
	const entries = new MemoryRecords(database);
	const relationships = new RelationshipRecords(database);
	const search = new KnowledgeIndexRecords(database);
	const embeddings = new InMemoryEmbeddingClient();
	for (const content of ['Original', 'Replacement', 'Accepted']) {
		embeddings.vectorsByContent.set(
			`Project memory\n${content}`,
			Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0))
		);
	}
	const index = createContentIndex(search, embeddings.model);
	const controller = new Suggestions(
		new ProvenancePresentationService(),
		capabilityDependencies<SuggestionsDependencies>({
			...agentToolResultsFixture(),
			todoCreationRules: new TodoEditingRulesService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionFinder: inbox.finder,
			suggestionAccepter: inbox.accepter,
			suggestionReverter: inbox.reverter,
			suggestionEffects: new SuggestionEffects(repository),
			memoryChanges: createMemoryServices(entries, new ProjectRecords(database), provenance)
				.changes,
			relationshipCreator: createRelationshipServices(relationships, notes, anchors, provenance)
				.creator,
			memoryIndexer: index,
			indexWriter: index,
			indexEmbeddings: embeddings,
			transactionRunner,
			now: () => now
		})
	);
	return {
		...transaction,
		suggestions,
		inbox,
		repository,
		entries,
		relationships,
		notes,
		search,
		embeddings,
		controller
	};
};
const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const provenance = await seedProvenance(seeded.owner, suffix);
	return { ...seeded, provenance, ...application(createTransactionContext(context.db)) };
};
const memoryReplacement = async (suffix: string) => {
	const state = await setup(suffix);
	const original = await state.entries.insert(state.owner, {
		id: crypto.randomUUID() as MemoryEntryId,
		userId: state.owner.userId,
		projectId: state.project.id,
		content: 'Original',
		shareWithAgents: true,
		createdAt: now,
		updatedAt: now
	});
	const suggestion = await state.inbox.creator.create(state.owner, {
		kind: 'memory',
		provenanceId: state.provenance.id,
		payload: {
			scope: 'project',
			projectId: state.project.id,
			operation: 'update',
			memoryEntryId: original.id,
			content: 'Replacement'
		}
	});
	const accepted = await state.controller.accept(state.owner, { suggestionId: suggestion.id });
	const replacement = await state.entries.findById(
		state.owner,
		accepted.artifact.id as MemoryEntryId
	);
	if (!replacement) throw new Error('Accepted memory replacement was not stored');
	return { ...state, original, replacement, suggestion };
};
const activeMemory = async (state: Awaited<ReturnType<typeof memoryReplacement>>) =>
	(await state.entries.list(state.owner, { projectId: state.project.id })).map(
		({ id, content }) => ({ id, content })
	);

describe('Durable proposal application effects', () => {
	it('restores both memory records and their search index through the controller', async () => {
		const state = await memoryReplacement('9501');
		const result = await state.controller.revert(state.owner, {
			suggestionId: state.suggestion.id
		});
		expect({
			status: result.status,
			stored: await state.suggestions.findById(state.owner, result.id),
			active: await activeMemory(state),
			originalChunks: (await state.search.listForMemoryEntry(state.owner, state.original.id)).map(
				(c) => c.content
			),
			replacementChunks: await state.search.listForMemoryEntry(state.owner, state.replacement.id)
		}).toEqual({
			status: 'reverted',
			stored: result,
			active: [{ id: state.original.id, content: 'Original' }],
			originalChunks: ['Original'],
			replacementChunks: []
		});
	});
	it('refuses stale undo before restoring either memory record', async () => {
		const state = await memoryReplacement('9502');
		await state.entries.update(state.owner, { ...state.replacement, content: 'Later edit' });
		const outcome = await state.controller
			.revert(state.owner, { suggestionId: state.suggestion.id })
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({
			outcome,
			active: await activeMemory(state),
			status: (await state.suggestions.findById(state.owner, state.suggestion.id))?.status
		}).toEqual({
			outcome: 'Cannot undo this suggestion because its saved data has changed.',
			active: [{ id: state.replacement.id, content: 'Later edit' }],
			status: 'accepted'
		});
	});
	it('preserves an existing relationship when undo restores its justification', async () => {
		const state = await setup('9503');
		const target = await state.notes.insert(state.owner, {
			...state.note,
			id: crypto.randomUUID() as NoteId,
			position: 1
		});
		const original = await state.relationships.insert(state.owner, {
			id: crypto.randomUUID() as RelationshipId,
			userId: state.owner.userId,
			sourceNoteId: state.note.id,
			targetNoteId: target.id,
			kind: 'elaborates',
			justification: 'Original',
			createdAt: now,
			updatedAt: now
		});
		const suggestion = await state.inbox.creator.create(state.owner, {
			kind: 'backlink',
			noteId: state.note.id,
			provenanceId: state.provenance.id,
			payload: {
				sourceNoteId: original.sourceNoteId,
				targetNoteId: original.targetNoteId,
				kind: original.kind,
				justification: 'Suggested'
			}
		});
		await state.controller.accept(state.owner, { suggestionId: suggestion.id });
		await state.controller.revert(state.owner, { suggestionId: suggestion.id });
		expect(await state.relationships.findById(state.owner, original.id)).toMatchObject({
			id: original.id,
			justification: 'Original'
		});
	});
	it('rolls back restored records when the surrounding transaction fails', async () => {
		const state = await memoryReplacement('9505');
		await state.transactionRunner
			.run(async () => {
				await state.controller.revert(state.owner, { suggestionId: state.suggestion.id });
				throw new Error('Rejected surrounding write');
			})
			.catch((error) => ({ kind: 'failure', error }));
		expect({
			active: await activeMemory(state),
			status: (await state.suggestions.findById(state.owner, state.suggestion.id))?.status,
			replacementChunks: (
				await state.search.listForMemoryEntry(state.owner, state.replacement.id)
			).map((c) => c.content),
			originalChunks: await state.search.listForMemoryEntry(state.owner, state.original.id)
		}).toEqual({
			active: [{ id: state.replacement.id, content: 'Replacement' }],
			status: 'accepted',
			replacementChunks: ['Replacement'],
			originalChunks: []
		});
	});
	it('serializes two controller undo attempts with one completed state transition', async () => {
		const state = await memoryReplacement('9506');
		const connection = connectPostgresTestDatabase(context.url);
		try {
			const second = application(createTransactionContext(connection.db));
			const results = await Promise.allSettled([
				state.controller.revert(state.owner, { suggestionId: state.suggestion.id }),
				second.controller.revert(state.owner, { suggestionId: state.suggestion.id })
			]);
			expect({
				outcomes: results.map((r) => r.status).sort(),
				active: await activeMemory(state),
				status: (await state.suggestions.findById(state.owner, state.suggestion.id))?.status
			}).toEqual({
				outcomes: ['fulfilled', 'rejected'],
				active: [{ id: state.original.id, content: 'Original' }],
				status: 'reverted'
			});
		} finally {
			await connection.close();
		}
	});
	it('serializes competing controller acceptances with one effect and one artifact', async () => {
		const state = await setup('9508');
		const suggestion = await state.inbox.creator.create(state.owner, {
			kind: 'memory',
			provenanceId: state.provenance.id,
			payload: {
				scope: 'project',
				projectId: state.project.id,
				operation: 'add',
				content: 'Accepted'
			}
		});
		const connection = connectPostgresTestDatabase(context.url);
		try {
			const second = application(createTransactionContext(connection.db));
			const results = await Promise.allSettled([
				state.controller.accept(state.owner, { suggestionId: suggestion.id }),
				second.controller.accept(state.owner, { suggestionId: suggestion.id })
			]);
			const accepted = await state.suggestions.findById(state.owner, suggestion.id);
			expect({
				outcomes: results.map((r) => r.status).sort(),
				artifactIds: (await state.entries.list(state.owner, { projectId: state.project.id })).map(
					(e) => e.id
				),
				effectId: (await state.repository.find(state.owner, suggestion.id))?.changes[0]?.after.value
					.id
			}).toEqual({
				outcomes: ['fulfilled', 'rejected'],
				artifactIds: [accepted?.appliedArtifactId],
				effectId: accepted?.appliedArtifactId
			});
		} finally {
			await connection.close();
		}
	});
	it('rejects an invalid stored effect at the repository boundary', async () => {
		const state = await setup('9507');
		const suggestion = await state.inbox.creator.create(state.owner, {
			kind: 'memory',
			provenanceId: state.provenance.id,
			payload: { scope: 'user', operation: 'add', content: 'Original' }
		});
		await state.database.execute(
			sql`insert into suggestion_application_effects(suggestion_id,user_id,effect) values (${suggestion.id},${state.owner.userId},'{"changes":[]}'::jsonb)`
		);
		await expect(state.repository.find(state.owner, suggestion.id)).rejects.toThrow();
	});
	it('keeps acceptance and replacement intact when restored memory cannot be indexed', async () => {
		const state = await memoryReplacement('23101');
		state.embeddings.failure = new Error('Embedding unavailable');
		const outcome = await state.controller
			.revert(state.owner, { suggestionId: state.suggestion.id })
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({
			outcome,
			active: await activeMemory(state),
			status: (await state.suggestions.findById(state.owner, state.suggestion.id))?.status
		}).toEqual({
			outcome: 'Embedding unavailable',
			active: [{ id: state.replacement.id, content: 'Replacement' }],
			status: 'accepted'
		});
	});
	it('refuses a different actor without restoring the owned replacement', async () => {
		const state = await memoryReplacement('23102');
		const foreign = await seedNote('23112');
		const outcome = await state.controller
			.revert(foreign.owner, { suggestionId: state.suggestion.id })
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({ outcome, active: await activeMemory(state) }).toEqual({
			outcome: 'Suggestion was not found',
			active: [{ id: state.replacement.id, content: 'Replacement' }]
		});
	});
});
