import { describe, expect, it } from 'vitest';
import { Relationships } from './controller';
import type { TextSelection } from '$lib/models/notes';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient,
	InMemoryReranker
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import {
	InMemoryProvenanceRecorder,
	InMemoryStructuredRelationshipClient
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryWorkflowRunner } from '$lib/testing/agent/fakes/in-memory-workflow-runner';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};
const setup = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder({ plainText: selection.text })];
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const repository = new InMemorySearchRepository();
	const client = new InMemoryStructuredRelationshipClient();
	client.result = { kind: 'prior_decision', justification: 'Earlier decision', confidence: 88 };
	const controller = new Relationships({
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		knowledgeLookup: new KnowledgeLookup(repository),
		embeddings: new InMemoryEmbeddingClient(),
		reranker: new InMemoryReranker(),
		relationshipClassifier: new RelationshipDiscovery({ client }),
		suggestionCreator: suggestions,
		transactionRunner: new InMemoryTransactionRunner([content, provenance, suggestions]),
		workflowRunner: new InMemoryWorkflowRunner()
	});
	return { controller, repository, client, suggestions, content };
};

describe('related-note proposal workflow', () => {
	it('creates one proposal from duplicate passages and preserves its relationship label', async () => {
		const { controller, repository } = setup();
		await repository.replaceForNote(testActor(), testNoteId(2), [
			searchDocumentBuilder(),
			searchDocumentBuilder({ chunkIndex: 1 })
		]);
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.suggestions.map((suggestion) => suggestion.payload)).toMatchObject([
			{ targetNoteId: testNoteId(2), kind: 'prior_decision', justification: 'Earlier decision' }
		]);
	});
	it('excludes its own note and notes from other projects', async () => {
		const { controller, repository } = setup();
		await repository.replaceForNote(testActor(), testNoteId(), [
			searchDocumentBuilder({ noteId: testNoteId() })
		]);
		await repository.replaceForNote(testActor(), testNoteId(2), [
			searchDocumentBuilder({ projectId: testProjectId(2) })
		]);
		expect((await controller.suggestFromSelection(testActor(), { selection })).suggestions).toEqual(
			[]
		);
	});
	it('returns no proposals when retrieval has no matches', async () => {
		const { controller } = setup();
		expect((await controller.suggestFromSelection(testActor(), { selection })).suggestions).toEqual(
			[]
		);
	});
	it('rolls back the selection anchor when proposal persistence fails', async () => {
		const { controller, repository, suggestions, content } = setup();
		await repository.replaceForNote(testActor(), testNoteId(2), [searchDocumentBuilder()]);
		suggestions.failCreation = true;
		try {
			await controller.suggestFromSelection(testActor(), { selection });
		} catch {
			/* Inspect the durable result below. */
		}
		expect(content.anchors).toEqual([]);
	});
	it('rejects cancelled work before publishing any proposal', async () => {
		const { controller } = setup();
		await expect(
			controller.suggestFromSelection(
				testActor(),
				{ selection },
				AbortSignal.abort(new Error('Cancelled'))
			)
		).rejects.toThrow('Cancelled');
	});
});
