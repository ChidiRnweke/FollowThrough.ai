import { InMemoryDiagrams } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';
import type { DiagramSuggestion } from '$lib/models/suggestions';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import {
	testActor,
	testSuggestionId,
	testProvenanceId,
	testNoteId,
	testNow,
	memoryEntryBuilder,
	testMemoryEntryId,
	memorySuggestionBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';

describe('Proposal effect coordination', () => {
	it('records the final reviewed diagram instead of the generated preview', async () => {
		const suggestions = new InMemorySuggestions();
		const effects = new InMemorySuggestionEffects();
		const generated = drawioBuilder({
			source: VALID_DRAWIO_XML,
			publishedRevision: 0,
			publishedAt: undefined
		});
		const proposal: DiagramSuggestion = {
			id: testSuggestionId(),
			userId: testActor().userId,
			noteId: testNoteId(),
			kind: 'diagram',
			status: 'proposed',
			payload: { noteId: testNoteId(), kind: 'drawio', source: VALID_DRAWIO_XML },
			provenanceId: testProvenanceId(),
			isAutoAccepted: false,
			createdAt: testNow,
			updatedAt: testNow
		};
		suggestions.suggestions = [proposal];
		const reviewed = {
			...generated,
			renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Reviewed</text></svg>',
			searchableText: 'Reviewed'
		};
		const controller = new Suggestions(
			capabilityDependencies<SuggestionsDependencies>({
				suggestionFinder: suggestions,
				suggestionAccepter: suggestions,
				suggestionEffects: effects,
				artifactApplier: {
					apply: async () => ({
						artifact: generated,
						changes: [{ kind: 'created', after: { type: 'diagrams', value: generated } }]
					})
				},
				drawioWrites: { write: async () => reviewed },
				diagramIndexer: new InMemoryDiagrams(),
				transactionRunner: new InMemoryTransactionRunner([suggestions, effects])
			})
		);
		await controller.acceptReviewed(testActor(), {
			suggestionId: proposal.id,
			drawioReview: {
				noteId: testNoteId(),
				source: reviewed.source,
				renderedSvg: reviewed.renderedSvg
			}
		});
		expect(effects.repository.effects.get(proposal.id)?.changes[0]?.after).toEqual({
			type: 'diagrams',
			value: reviewed
		});
	});
	it('reindexes the restored memory and removes the replacement from search', async () => {
		const suggestions = new InMemorySuggestions();
		const effects = new InMemorySuggestionEffects();
		const search = new InMemorySearchRepository();
		const indexer = new ContentIndex(search, new InMemoryEmbeddingClient()).memories;
		const before = memoryEntryBuilder();
		const deleted = { ...before, deletedAt: testNow };
		const replacement = memoryEntryBuilder({
			id: testMemoryEntryId(2),
			content: 'Replacement',
			replacesEntryId: before.id
		});
		const proposal = memorySuggestionBuilder({
			status: 'accepted',
			appliedArtifactId: replacement.id,
			decidedAt: testNow
		});
		suggestions.suggestions = [proposal];
		await effects.record(testActor(), proposal.id, [
			{
				kind: 'modified',
				before: { type: 'memory_entries', value: before },
				after: { type: 'memory_entries', value: deleted }
			},
			{ kind: 'created', after: { type: 'memory_entries', value: replacement } }
		]);
		await indexer.index(testActor(), replacement);
		const controller = new Suggestions(
			capabilityDependencies<SuggestionsDependencies>({
				suggestionFinder: suggestions,
				suggestionReverter: suggestions,
				suggestionEffects: effects,
				memoryIndexer: indexer,
				transactionRunner: new InMemoryTransactionRunner([suggestions, effects])
			})
		);
		await controller.revert(testActor(), { suggestionId: proposal.id });
		expect(search.documents.map((item) => item.document.memoryEntryId)).toEqual([before.id]);
	});
});
