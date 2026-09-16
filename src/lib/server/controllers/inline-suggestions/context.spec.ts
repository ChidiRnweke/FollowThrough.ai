import { describe, expect, it } from 'vitest';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import type { Reranker } from '$lib/server/services/knowledge-search/contracts';
import { InMemoryReranker } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import {
	memoryEntryBuilder,
	noteBuilder,
	testActor,
	testMemoryEntryId,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	inlineContextTraceOutput,
	vectorSearchTraceOutput
} from '$lib/server/services/inline-suggestions/inline-context';

const actor = testActor();
const note = noteBuilder({
	id: testNoteId(),
	projectId: testProjectId(),
	title: 'Architecture',
	plainText: 'The complete authoritative note.'
});
const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000099',
	noteId: note.id,
	projectId: note.projectId,
	revision: 2,
	blockType: 'paragraph',
	headingPath: [],
	currentSection: 'There is a totally unrelated document about',
	prefix: 'There is a totally unrelated document about - ',
	suffix: ''
};

const match = (content: string, overrides: Partial<SearchMatch['document']> = {}): SearchMatch => ({
	document: {
		id: crypto.randomUUID() as SearchDocumentId,
		projectId: note.projectId,
		noteId: testNoteId(2),
		sourceTitle: 'The Odyssey',
		content,
		contentHash: crypto.randomUUID(),
		sourceRevision: 1,
		chunkIndex: 0,
		...overrides
	},
	score: 0.9
});

const relevantReranker = () => {
	const reranker = new InMemoryReranker();
	reranker.order = 'relevant-first';
	return reranker;
};
const failingReranker = () => {
	const reranker = new InMemoryReranker();
	reranker.failure = new Error('reranker unavailable');
	return reranker;
};
const build = async (
	projectMatches: readonly SearchMatch[] = [],
	memories: readonly MemoryEntry[] = [],
	reranker: Reranker = relevantReranker()
) => {
	const fixture = inlineSuggestionFixture({ reranker });
	fixture.notes.notes = [note];
	fixture.memory.entries = [...memories];
	fixture.search.documents = projectMatches.map((match) => ({
		userId: actor.userId,
		document: { ...match.document, embedding: [1, 0, 0], embeddingModel: 'fake' }
	}));
	await fixture.controller.suggest(actor, request, new AbortController().signal);
	const context = fixture.generator.contexts[0];
	if (!context) throw new Error('Completion received no context');
	return context;
};

const userMemory = (index: number, content = `memory ${index}`): MemoryEntry =>
	memoryEntryBuilder({
		id: testMemoryEntryId(index + 1),
		projectId: undefined,
		content
	});

describe('inline completion context', () => {
	it('includes the authoritative note title and full text', async () => {
		const context = await build();
		expect({ title: context.noteTitle, text: context.noteText }).toEqual({
			title: 'Architecture',
			text: 'The complete authoritative note.'
		});
	});

	it('keeps source titles and contents in project passages', async () => {
		const context = await build([match('Greek epic content')]);
		expect(context.projectPassages[0]).toEqual({
			sourceTitle: 'The Odyssey',
			sourceType: 'note',
			content: 'Greek epic content'
		});
	});

	it('does not duplicate the current note through project retrieval', async () => {
		const context = await build([match('duplicate', { noteId: note.id })]);
		expect(context.projectPassages).toEqual([]);
	});

	it('removes current-note chunks before project reranking', async () => {
		const current = Array.from({ length: 9 }, (_, index) =>
			match(`current ${index}`, { noteId: note.id })
		);
		const context = await build([...current, match('other project note')]);
		expect(context.projectPassages.map((passage) => passage.content)).toEqual([
			'other project note'
		]);
	});

	it('falls back to vector order when project reranking fails', async () => {
		const matches = Array.from({ length: 10 }, (_, index) => match(`project ${index}`));
		const context = await build(matches, [], failingReranker());
		expect(context.projectPassages.map((passage) => passage.content)).toEqual(
			matches.slice(0, 8).map((candidate) => candidate.document.content)
		);
	});

	it('reranks project passages even when fewer than eight candidates were retrieved', async () => {
		const context = await build([
			match('earlier vector result'),
			match('relevant current decision')
		]);
		expect(context.projectPassages[0]?.content).toBe('relevant current decision');
	});

	it('injects every shared user memory at or below the threshold', async () => {
		const memories = Array.from({ length: 20 }, (_, index) => userMemory(index));
		const context = await build([], memories);
		expect(context.userMemory).toHaveLength(20);
	});

	it('excludes unshared user memory', async () => {
		const context = await build([], [userMemory(0), { ...userMemory(1), shareWithAgents: false }]);
		expect(context.userMemory).toEqual(['memory 0']);
	});

	it('reranks user memory above the threshold and keeps eight', async () => {
		const memories = Array.from({ length: 21 }, (_, index) =>
			userMemory(index, index === 20 ? 'relevant owner is Ana' : `memory ${index}`)
		);
		const context = await build([], memories);
		expect({ count: context.userMemory.length, first: context.userMemory[0] }).toEqual({
			count: 8,
			first: 'relevant owner is Ana'
		});
	});

	it('falls back to recent bounded memory when reranking fails', async () => {
		const memories = Array.from({ length: 21 }, (_, index) => userMemory(index));
		const context = await build([], memories, failingReranker());
		expect(context.userMemory).toEqual(memories.slice(0, 8).map((entry) => entry.content));
	});
});

describe('trace output payloads', () => {
	it('serializes the actual memories and passages, never counts', async () => {
		const context = await build([match('Greek epic content')], [userMemory(0)]);
		expect(JSON.parse(inlineContextTraceOutput(context))).toEqual({
			noteTitle: 'Architecture',
			userMemory: ['memory 0'],
			projectPassages: [
				{ sourceTitle: 'The Odyssey', sourceType: 'note', content: 'Greek epic content' }
			]
		});
	});

	it('serializes actual vector-search matches with scores and content', () => {
		const results = [match('Greek epic content')];
		expect(JSON.parse(vectorSearchTraceOutput(results))).toEqual([
			{
				id: results[0].document.id,
				sourceTitle: 'The Odyssey',
				noteId: results[0].document.noteId,
				score: 0.9,
				content: 'Greek epic content'
			}
		]);
	});
});
