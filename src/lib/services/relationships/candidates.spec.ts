import { expect, it } from 'vitest';
import { relatedNoteMatches, relatedNoteCandidate } from './candidates';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testNoteId, testMemoryEntryId } from '$lib/testing/workspace/fixtures/domain-builders';

it('keeps the strongest passage when weaker chunks repeat a note', () => {
	const matches = relatedNoteMatches(testNoteId(), [
		{ document: searchDocumentBuilder({ content: 'Strong evidence' }), score: 0.9 },
		{ document: searchDocumentBuilder({ content: 'Weak evidence', chunkIndex: 1 }), score: 0.2 }
	]);
	expect(matches).toEqual([{ noteId: testNoteId(2), content: 'Strong evidence', score: 0.9 }]);
});

it('excludes the source note and search results that do not identify a note', () => {
	expect(
		relatedNoteMatches(testNoteId(), [
			{ document: searchDocumentBuilder({ noteId: testNoteId() }), score: 1 },
			{
				document: searchDocumentBuilder({ noteId: undefined, memoryEntryId: testMemoryEntryId() }),
				score: 1
			}
		])
	).toEqual([]);
});

it('combines bounded classification and retrieval confidence', () => {
	expect(
		relatedNoteCandidate(
			{ noteId: testNoteId(2), content: 'Evidence', score: 0.8 },
			{
				kind: 'prior_decision',
				justification: 'An earlier decision',
				confidence: 60
			}
		)
	).toEqual({
		targetNoteId: testNoteId(2),
		kind: 'prior_decision',
		justification: 'An earlier decision',
		confidence: 70
	});
});
