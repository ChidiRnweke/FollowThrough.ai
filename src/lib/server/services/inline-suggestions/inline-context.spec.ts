import { describe, expect, it } from 'vitest';
import { InlineContextService } from '$lib/server/services/inline-suggestions/inline-context';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
const rules = new InlineContextService(testTokenizer);
import {
	memoryEntryBuilder,
	noteBuilder,
	testMemoryEntryId,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';

describe('inline grounding selection', () => {
	it('never includes deleted or unshared memory', () => {
		const entries = [
			memoryEntryBuilder({ projectId: undefined, content: 'Shared' }),
			memoryEntryBuilder({
				id: testMemoryEntryId(2),
				projectId: undefined,
				shareWithAgents: false,
				content: 'Private'
			}),
			memoryEntryBuilder({
				id: testMemoryEntryId(3),
				projectId: undefined,
				deletedAt: testNow,
				content: 'Deleted'
			})
		];
		expect(rules.inlineMemoryPlan(entries, noteBuilder())).toEqual({
			kind: 'complete',
			contents: ['Shared']
		});
	});
	it('excludes current-note chunks before any reranker sees candidates', () => {
		const other = { document: searchDocumentBuilder({ noteId: testNoteId(2) }), score: 1 };
		expect(
			rules.inlineProjectCandidates(
				[{ document: searchDocumentBuilder({ noteId: testNoteId() }), score: 1 }, other],
				noteBuilder()
			)
		).toEqual([other]);
	});
});
