import { describe, expect, it } from 'vitest';
import type {
	ActorContext,
	InlineSuggestionRequest,
	MemoryEntry,
	ProjectId,
	SearchDocumentId,
	SearchMatch
} from '$lib/models';
import type { KnowledgeSearcher, MemoryEntryLister, Reranker } from '$lib/server/services';
import {
	memoryEntryBuilder,
	noteBuilder,
	testActor,
	testMemoryEntryId,
	testNoteId,
	testProjectId
} from '$lib/testing/fixtures/domain-builders';
import {
	inlineContextTraceOutput,
	InlineSuggestionContext,
	vectorSearchTraceOutput
} from './inline-context';

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

class Searcher implements KnowledgeSearcher {
	constructor(private readonly results: readonly SearchMatch[]) {}
	async search(
		_actor: ActorContext,
		_query: string,
		_limit?: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		return projectId === note.projectId ? this.results : [];
	}
}

class FailingSearcher implements KnowledgeSearcher {
	async search(): Promise<readonly SearchMatch[]> {
		throw new Error('embedding unavailable');
	}
}

class Memories implements MemoryEntryLister {
	constructor(private readonly entries: readonly MemoryEntry[]) {}
	async list(): Promise<readonly MemoryEntry[]> {
		return this.entries;
	}
}

class RelevantReranker implements Reranker {
	async rerank(
		_query: string,
		matches: readonly SearchMatch[],
		topN: number
	): Promise<readonly SearchMatch[]> {
		return [...matches]
			.sort(
				(left, right) =>
					Number(right.document.content.includes('relevant')) -
					Number(left.document.content.includes('relevant'))
			)
			.slice(0, topN);
	}
}

class FailingReranker implements Reranker {
	async rerank(): Promise<readonly SearchMatch[]> {
		throw new Error('reranker unavailable');
	}
}

const build = (
	projectMatches: readonly SearchMatch[] = [],
	memories: readonly MemoryEntry[] = [],
	reranker: Reranker = new RelevantReranker()
) =>
	new InlineSuggestionContext({
		searcher: new Searcher(projectMatches),
		memory: new Memories(memories),
		reranker
	}).build(actor, request, note, new AbortController().signal);

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
		const context = await build(matches, [], new FailingReranker());
		expect(context.projectPassages.map((passage) => passage.content)).toEqual(
			matches.slice(0, 8).map((candidate) => candidate.document.content)
		);
	});

	it('degrades project retrieval failure to empty passages', async () => {
		const context = await new InlineSuggestionContext({
			searcher: new FailingSearcher(),
			memory: new Memories([]),
			reranker: new RelevantReranker()
		}).build(actor, request, note, new AbortController().signal);
		expect(context.projectPassages).toEqual([]);
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
		const context = await build([], memories, new FailingReranker());
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
