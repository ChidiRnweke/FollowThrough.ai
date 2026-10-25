import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { describe, expect, it } from 'vitest';
import type { InlineCompletionContext, InlineSuggestionRequest } from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import {
	memoryEntryBuilder,
	noteBuilder,
	testActor,
	testMemoryEntryId,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

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
	grounding: 'reuse',
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

type RerankBehaviour = (provider: InMemoryRetrievalProvider) => void;
const relevantReranker = (): RerankBehaviour => (provider) => {
	provider.rerankOrder = 'relevant-first';
};
const failingReranker = (): RerankBehaviour => (provider) => {
	provider.rerankFailure = new Error('reranker unavailable');
};
const build = async (
	projectMatches: readonly SearchMatch[] = [],
	memories: readonly MemoryEntry[] = [],
	reranker: RerankBehaviour = relevantReranker()
) => {
	const fixture = inlineSuggestionFixture();
	reranker(fixture.provider);
	fixture.notes.notes = [note];
	fixture.memory.entries = [...memories];
	fixture.search.documents = projectMatches.map((match) => ({
		userId: actor.userId,
		document: { ...match.document, embedding: [1, 0, 0], embeddingModel: 'fake' }
	}));
	await fixture.controller.suggest(request, new AbortController().signal);
	const context = fixture.generator.requests[0]?.context;
	if (!context) throw new Error('Completion received no context');
	return context;
};
const passages = (context: InlineCompletionContext) =>
	context.projectPassages.map((passage) => passage.content);

/** A fixture whose section already holds grounding from an earlier rest, built against the corpus as it is now. */
const storedGrounding = async () => {
	const fixture = inlineSuggestionFixture();
	fixture.notes.notes = [note];
	const stored = 'stored passage';
	const section = request.headingPath.join('\u001f');
	await fixture.snapshots.put(
		{ noteId: note.id, sectionKey: section },
		{
			projectPassages: [{ sourceType: 'note', sourceTitle: 'Earlier rest', content: stored }],
			userMemory: [],
			knowledgeMarker: fixture.snapshots.markers.knowledge,
			memoryMarker: fixture.snapshots.markers.memory
		}
	);
	return { fixture, section, stored };
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
		expect(context.projectPassages).toEqual([
			{ sourceType: 'note', sourceTitle: 'The Odyssey', content: 'Greek epic content' }
		]);
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
		expect(passages(context)).toEqual(['other project note']);
	});

	it('falls back to vector order when project reranking fails', async () => {
		const matches = Array.from({ length: 10 }, (_, index) => match(`project ${index}`));
		const context = await build(matches, [], failingReranker());
		expect(passages(context)).toEqual([
			'project 0',
			'project 1',
			'project 2',
			'project 3',
			'project 4',
			'project 5',
			'project 6',
			'project 7'
		]);
	});

	it('reranks project passages even when fewer than eight candidates were retrieved', async () => {
		const context = await build([
			match('earlier vector result'),
			match('relevant current decision')
		]);
		expect(passages(context)[0]).toBe('relevant current decision');
	});

	it('injects every shared user memory at or below the threshold', async () => {
		const memories = Array.from({ length: 20 }, (_, index) => userMemory(index));
		const context = await build([], memories);
		expect(context.userMemory).toEqual(Array.from({ length: 20 }, (_, index) => `memory ${index}`));
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
		expect(context.userMemory).toEqual([
			'relevant owner is Ana',
			'memory 0',
			'memory 1',
			'memory 2',
			'memory 3',
			'memory 4',
			'memory 5',
			'memory 6'
		]);
	});

	it('reuses the grounding stored for the section instead of retrieving', async () => {
		const { fixture, section, stored } = await storedGrounding();
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: {
					...match('fresh passage').document,
					embedding: [1, 0, 0],
					embeddingModel: 'fake'
				}
			}
		];
		const result = await fixture.controller.suggest(request, new AbortController().signal);
		expect({
			passages: passages(fixture.generator.requests[0]!.context),
			source: result.outcome === 'suggested' ? result.grounding.source : result.outcome,
			section
		}).toEqual({ passages: [stored], source: 'snapshot', section: '' });
	});

	it('retrieves again when the project knowledge changed since the grounding was stored', async () => {
		const { fixture } = await storedGrounding();
		fixture.snapshots.markers = { knowledge: 'knowledge-2', memory: 'memory-1' };
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: {
					...match('fresh passage').document,
					embedding: [1, 0, 0],
					embeddingModel: 'fake'
				}
			}
		];
		await fixture.controller.suggest(request, new AbortController().signal);
		expect(passages(fixture.generator.requests[0]!.context)).toEqual(['fresh passage']);
	});

	it('retrieves again when the writer asks explicitly', async () => {
		const { fixture } = await storedGrounding();
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: {
					...match('fresh passage').document,
					embedding: [1, 0, 0],
					embeddingModel: 'fake'
				}
			}
		];
		const result = await fixture.controller.suggest(
			{ ...request, grounding: 'rebuild' },
			new AbortController().signal
		);
		expect({
			passages: passages(fixture.generator.requests[0]!.context),
			source: result.outcome === 'suggested' ? result.grounding.source : result.outcome
		}).toEqual({ passages: ['fresh passage'], source: 'retrieval' });
	});

	it('keeps what it retrieved for the next rest in the section', async () => {
		const fixture = inlineSuggestionFixture();
		fixture.notes.notes = [note];
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: {
					...match('Greek epic content').document,
					embedding: [1, 0, 0],
					embeddingModel: 'fake'
				}
			}
		];
		await fixture.controller.suggest(request, new AbortController().signal);
		expect([...fixture.snapshots.rows.values()]).toEqual([
			{
				projectPassages: [
					{ sourceType: 'note', sourceTitle: 'The Odyssey', content: 'Greek epic content' }
				],
				userMemory: [],
				knowledgeMarker: 'knowledge-1',
				memoryMarker: 'memory-1'
			}
		]);
	});

	it('falls back to recent bounded memory when reranking fails', async () => {
		const memories = Array.from({ length: 21 }, (_, index) => userMemory(index));
		const context = await build([], memories, failingReranker());
		expect(context.userMemory).toEqual([
			'memory 0',
			'memory 1',
			'memory 2',
			'memory 3',
			'memory 4',
			'memory 5',
			'memory 6',
			'memory 7'
		]);
	});
});
