import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { describe, expect, it } from 'vitest';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	diagramBuilder,
	memoryEntryBuilder,
	noteBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

const indexedChunks = async (content: string, targetTokens: number, overlapTokens: number) => {
	const repository = new InMemorySearchRepository();
	const index = createContentIndex(
		repository,
		'test-embedding',
		{ targetTokens, overlapTokens },
		true
	);
	await index.notes.index(testActor(), noteBuilder({ plainText: content }));
	return repository.documents.map(({ document }) => document.content);
};

describe('Content chunking invariants', () => {
	it('retains repeated final paragraphs instead of treating equal text as an overlap', async () => {
		expect(await indexedChunks('alpha beta\n\nalpha beta', 2, 0)).toEqual([
			'alpha beta',
			'alpha beta'
		]);
	});
	it('uses large token chunks with a generous overlap', async () => {
		const chunks = await indexedChunks(
			Array.from({ length: 60 }, (_, index) => `word${index}`).join(' '),
			20,
			5
		);
		const encoding = testTokenizer;
		const left = encoding.encode(chunks[0]!);
		const right = encoding.encode(chunks[1]!);
		expect(right.slice(0, 5)).toEqual(left.slice(-5));
	});
	it('returns no chunks for empty content', async () => {
		expect(await indexedChunks('   ', 20, 0)).toEqual([]);
	});
	it('preserves paragraph boundaries when they fit', async () => {
		expect(await indexedChunks('First paragraph.\n\nSecond.', 30, 0)).toEqual([
			'First paragraph.\n\nSecond.'
		]);
	});
	it('splits content deterministically at the configured limit', async () => {
		expect(await indexedChunks('alpha beta gamma delta', 2, 0)).toEqual([
			'alpha beta',
			'gamma delta'
		]);
	});
});

describe('Search indexing invariants', () => {
	it('keeps distinct stored identities when identical chunks recur in a later revision', async () => {
		const repository = new InMemorySearchRepository();
		const index = createContentIndex(repository, 'test-embedding', {
			targetTokens: 2,
			overlapTokens: 0
		});
		const note = noteBuilder({ plainText: 'alpha beta\n\ngamma delta\n\nalpha beta' });
		const prepared = await index.notes.index(testActor(), note);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await index.complete(testActor(), prepared, {
			model: 'test-embedding',
			vectors: prepared.missing.map(() => [1, 2])
		});
		const originalIds = repository.documents.map(({ document }) => document.id);
		await index.notes.index(testActor(), { ...note, currentRevision: 2 });
		expect(repository.documents.map(({ document }) => document.id)).toEqual(originalIds);
	});

	it('stores every generated chunk', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(
			repository,
			new InMemoryEmbeddingClient().model,
			{ targetTokens: 2, overlapTokens: 0 },
			true
		).notes;
		await indexer.index(testActor(), noteBuilder({ plainText: 'alpha beta gamma delta' }));
		expect(repository.documents).toHaveLength(2);
	});

	it('replaces the persisted vector when indexed content changes', async () => {
		const repository = new InMemorySearchRepository();
		const index = createContentIndex(repository, 'test-embedding');
		const note = noteBuilder(noteMarkdown.read('architecture'));
		const initial = await index.notes.index(testActor(), note);
		if (initial.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await index.complete(testActor(), initial, { model: 'test-embedding', vectors: [[1, 2, 3]] });

		const changed = await index.notes.index(testActor(), {
			...note,
			...noteMarkdown.read('blueprint'),
			currentRevision: 2
		});
		if (changed.kind === 'needs_embeddings')
			await index.complete(testActor(), changed, { model: 'test-embedding', vectors: [[4, 5, 6]] });

		expect({
			result: changed.kind,
			documents: repository.documents.map(({ document }) => ({
				content: document.content,
				embedding: document.embedding
			}))
		}).toEqual({
			result: 'needs_embeddings',
			documents: [{ content: 'blueprint', embedding: [4, 5, 6] }]
		});
	});

	it('reuses an existing embedding for unchanged content', async () => {
		const repository = new InMemorySearchRepository();
		const index = createContentIndex(repository, 'test-embedding');
		const note = noteBuilder({ plainText: 'architecture' });
		const prepared = await index.notes.index(testActor(), note);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await index.complete(testActor(), prepared, { model: 'test-embedding', vectors: [[1, 2, 3]] });
		await index.notes.index(testActor(), { ...note, currentRevision: 2 });
		expect(repository.documents[0]?.document.embedding).toEqual([1, 2, 3]);
	});

	it('requires new vectors when the embedding model changes', async () => {
		const repository = new InMemorySearchRepository();
		const note = noteBuilder({ plainText: 'architecture' });
		const original = createContentIndex(repository, 'first-model');
		const prepared = await original.notes.index(testActor(), note);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await original.complete(testActor(), prepared, { model: 'first-model', vectors: [[1, 2, 3]] });
		const replacement = await createContentIndex(repository, 'second-model').notes.index(
			testActor(),
			{
				...note,
				currentRevision: 2
			}
		);
		expect(replacement).toMatchObject({
			kind: 'needs_embeddings',
			model: 'second-model',
			missing: [{ input: note.title + '\narchitecture' }]
		});
	});

	it('replaces stale chunks after content changes', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).notes;
		const note = noteBuilder({ plainText: 'old content' });
		await indexer.index(testActor(), note);
		await indexer.index(testActor(), { ...note, plainText: 'new content', currentRevision: 2 });
		expect(repository.documents.map((item) => item.document.content)).toEqual(['new content']);
	});

	it('removes stale chunks when a note becomes empty', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).notes;
		const note = noteBuilder({ plainText: 'old content' });
		await indexer.index(testActor(), note);
		await indexer.index(testActor(), { ...note, plainText: '', currentRevision: 2 });
		expect(repository.documents).toEqual([]);
	});

	it('rejects an embedding count mismatch before storing prepared chunks', async () => {
		const repository = new InMemorySearchRepository();
		const index = createContentIndex(repository, 'test-embedding');
		const prepared = await index.notes.index(
			testActor(),
			noteBuilder({ plainText: 'architecture' })
		);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await expect(
			index.complete(testActor(), prepared, { model: 'test-embedding', vectors: [] })
		).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
	});
});

describe('Diagram indexing invariants', () => {
	it('stores diagram text as a diagram-scoped search document', async () => {
		const repository = new InMemorySearchRepository();
		const diagram = diagramBuilder();
		await createContentIndex(repository, 'test-embedding', undefined, true).diagrams.index(
			testActor(),
			diagram,
			{ kind: 'note', title: noteBuilder().title }
		);
		expect({
			diagramId: repository.documents[0]?.document.diagramId,
			noteId: repository.documents[0]?.document.noteId
		}).toEqual({ diagramId: diagram.id, noteId: undefined });
	});

	// A diagram in the trash is out of the project, so a search that still returned
	// it would offer the user something they cannot open.
	it('indexes no chunks for a diagram that is in the trash', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).diagrams;
		const diagram = diagramBuilder();
		await indexer.index(testActor(), diagram, { kind: 'note', title: noteBuilder().title });
		await indexer.index(testActor(), { ...diagram, archivedAt: testNow }, { kind: 'standalone' });
		expect(repository.documents).toHaveLength(0);
	});

	it('keeps note chunks when replacing diagram chunks', async () => {
		const repository = new InMemorySearchRepository();
		const note = noteBuilder({ plainText: 'note content' });
		await createContentIndex(repository, 'test-embedding', undefined, true).notes.index(
			testActor(),
			note
		);
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).diagrams;
		const diagram = diagramBuilder();
		await indexer.index(testActor(), diagram, { kind: 'note', title: noteBuilder().title });
		await indexer.index(
			testActor(),
			{ ...diagram, searchableText: 'revised diagram' },
			{ kind: 'note', title: note.title }
		);
		expect(repository.documents.filter((item) => !item.document.diagramId)).toHaveLength(1);
	});

	it('removes only diagram chunks when searchable text becomes empty', async () => {
		const repository = new InMemorySearchRepository();
		const note = noteBuilder({ plainText: 'note content' });
		await createContentIndex(repository, 'test-embedding', undefined, true).notes.index(
			testActor(),
			note
		);
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).diagrams;
		const diagram = diagramBuilder();
		await indexer.index(testActor(), diagram, { kind: 'note', title: noteBuilder().title });
		await indexer.index(testActor(), { ...diagram, searchableText: '' }, { kind: 'standalone' });
		expect(repository.documents.map((item) => item.document.content)).toEqual(['note content']);
	});

	// A studio diagram belongs to its project and never to a note, so the indexer
	// must not go looking for one — the note reader would throw.
	it('indexes a diagram that has no source note', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).diagrams;
		const diagram = diagramBuilder({ sourceNoteId: undefined, title: 'Delivery pipeline' });
		await indexer.index(testActor(), diagram, { kind: 'standalone' });
		expect(repository.documents[0]?.document.projectId).toBe(diagram.projectId);
	});

	// The chunk is a bare list of labels, so the title is the only context the
	// reranker gets. An untitled studio diagram indexed with an empty title would
	// rank on labels alone and effectively disappear.
	it('titles an untitled note-less diagram rather than indexing it blank', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).diagrams;
		await indexer.index(
			testActor(),
			diagramBuilder({ sourceNoteId: undefined, title: undefined }),
			{ kind: 'standalone' }
		);
		expect(repository.documents[0]?.document.sourceTitle).toBe('Diagram: Untitled diagram');
	});

	// A diagram chunk is its own retrieval source now: carrying the note as well
	// would violate the single-source constraint the database enforces.
});

describe('Memory indexing invariants', () => {
	it('stores memory content as a memory-scoped search document', async () => {
		const repository = new InMemorySearchRepository();
		const entry = memoryEntryBuilder();
		await createContentIndex(repository, 'test-embedding', undefined, true).memories.index(
			testActor(),
			entry
		);
		expect({
			memoryId: repository.documents[0]?.document.memoryEntryId,
			noteId: repository.documents[0]?.document.noteId
		}).toEqual({ memoryId: entry.id, noteId: undefined });
	});

	it('reuses a chunk with an unchanged content hash', async () => {
		const repository = new InMemorySearchRepository();
		const index = createContentIndex(repository, 'test-embedding');
		const entry = memoryEntryBuilder();
		const prepared = await index.memories.index(testActor(), entry);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected fresh chunks');
		await index.complete(testActor(), prepared, { model: 'test-embedding', vectors: [[1, 2, 3]] });
		const firstId = repository.documents[0]?.document.id;
		await index.memories.index(testActor(), entry);
		expect(repository.documents[0]?.document.id).toBe(firstId);
	});

	it('removes chunks for an entry withheld from agents', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).memories;
		const entry = memoryEntryBuilder();
		await indexer.index(testActor(), entry);
		await indexer.index(testActor(), { ...entry, shareWithAgents: false });
		expect(repository.documents).toEqual([]);
	});

	it('removes chunks for a deleted entry', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = createContentIndex(repository, 'test-embedding', undefined, true).memories;
		const entry = memoryEntryBuilder();
		await indexer.index(testActor(), entry);
		await indexer.index(testActor(), { ...entry, deletedAt: testNow });
		expect(repository.documents).toEqual([]);
	});
});
