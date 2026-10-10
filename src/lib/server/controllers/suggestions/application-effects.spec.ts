import type { DiagramSuggestion } from '$lib/models/suggestions';
import {
	DrawioLabelReader,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryDiagrams } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	memoryEntryBuilder,
	memorySuggestionBuilder,
	noteBuilder,
	testActor,
	testMemoryEntryId,
	testNoteId,
	testNow,
	testProvenanceId,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';

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
			new ProvenancePresentationService(),
			capabilityDependencies<SuggestionsDependencies>({
				...agentToolResultsFixture(),
				todoCreationRules: new TodoEditingRulesService(),
				suggestionPresentation: new SuggestionPresentationService(),
				suggestionFinder: suggestions,
				suggestionAccepter: suggestions,
				suggestionEffects: effects,
				sourceNotes: notes,
				diagramWriter: diagrams,
				drawioXmlValidator: new DrawioXmlValidator(),
				drawioSvgSanitizer: new DrawioSvgSanitizer(),
				diagramLabelPresentation: new DiagramLabelPresentationService(),
				drawioLabels: new DrawioLabelReader(),
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
		const indexWriter = createContentIndex(
			search,
			new InMemoryEmbeddingClient().model,
			undefined,
			true
		);
		const indexer = indexWriter;
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
		await indexer.indexMemory(testActor(), replacement);
		const controller = new Suggestions(
			new ProvenancePresentationService(),
			capabilityDependencies<SuggestionsDependencies>({
				...agentToolResultsFixture(),
				todoCreationRules: new TodoEditingRulesService(),
				suggestionPresentation: new SuggestionPresentationService(),
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
