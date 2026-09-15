import { InMemoryDiagrams } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';
import type { DiagramSuggestion } from '$lib/models/suggestions';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	testActor,
	testSuggestionId,
	testProvenanceId,
	testNoteId,
	testNow,
	memoryEntryBuilder,
	testMemoryEntryId,
	memorySuggestionBuilder,
	noteBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	DrawioXmlValidator,
	DrawioSvgSanitizer,
	DrawioDiagramTextExtractor,
	DrawioLabelExtractor
} from '$lib/server/services/diagrams/drawio';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';

describe('Proposal effect coordination', () => {
	it('records the final reviewed diagram instead of the generated preview', async () => {
		const suggestions = new InMemorySuggestions();
		const effects = new InMemorySuggestionEffects();
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
			source: VALID_DRAWIO_XML.replace('API &amp; worker', 'Reviewed'),
			renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Reviewed</text></svg>',
			searchableText: 'Reviewed'
		};
		const diagrams = new InMemoryDiagrams();
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const controller = new Suggestions(
			capabilityDependencies<SuggestionsDependencies>({
				suggestionFinder: suggestions,
				suggestionAccepter: suggestions,
				suggestionEffects: effects,
				sourceNotes: notes,
				drawioLabels: new DrawioLabelExtractor(),
				diagramWriter: diagrams,
				drawioXmlValidator: new DrawioXmlValidator(),
				drawioSvgSanitizer: new DrawioSvgSanitizer(),
				drawioTextExtractor: new DrawioDiagramTextExtractor(),
				now: () => testNow,
				diagramIndexer: diagrams,
				transactionRunner: new InMemoryTransactionRunner([suggestions, effects, diagrams])
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
		expect(effects.repository.effects.get(proposal.id)?.changes[0]?.after).toMatchObject({
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
