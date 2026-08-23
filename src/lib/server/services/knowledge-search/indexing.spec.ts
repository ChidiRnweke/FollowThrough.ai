import { describe, expect, it } from 'vitest';
import {
	EmbeddedDiagramIndexer,
	EmbeddedMemoryIndexer,
	EmbeddedNoteIndexer,
	ParagraphChunker,
	TokenAwareChunker
} from './indexing';
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
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { retrievalEncoding } from './indexing';

describe('Content chunking invariants', () => {
	it('uses large token chunks with a generous overlap', () => {
		const chunks = new TokenAwareChunker(20, 5).chunk(
			Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ')
		);
		const encoding = retrievalEncoding();
		const left = encoding.encode(chunks[0]!);
		const right = encoding.encode(chunks[1]!);
		expect(right.slice(0, 5)).toEqual(left.slice(-5));
	});

	it('returns no chunks for empty content', () => {
		expect(new ParagraphChunker(20).chunk('   ')).toEqual([]);
	});

	it('preserves paragraph boundaries when they fit', () => {
		expect(new ParagraphChunker(30).chunk('First paragraph.\n\nSecond.')).toEqual([
			'First paragraph.\n\nSecond.'
		]);
	});

	it('splits content deterministically at the configured limit', () => {
		expect(new ParagraphChunker(12).chunk('alpha beta gamma delta')).toEqual([
			'alpha beta',
			'gamma delta'
		]);
	});
});

describe('Search indexing invariants', () => {
	it('stores every generated chunk', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedNoteIndexer(
			repository,
			new InMemoryEmbeddingClient(),
			new ParagraphChunker(12)
		);
		await indexer.index(testActor(), noteBuilder({ plainText: 'alpha beta gamma delta' }));
		expect(repository.documents).toHaveLength(2);
	});

	it('uses a SHA-256 content hash', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedNoteIndexer(repository, new InMemoryEmbeddingClient());
		await indexer.index(testActor(), noteBuilder({ plainText: 'architecture' }));
		expect(repository.documents[0]?.document.contentHash).toHaveLength(64);
	});

	it('reuses an existing embedding for unchanged content', async () => {
		const repository = new InMemorySearchRepository();
		const embedding = new InMemoryEmbeddingClient();
		const indexer = new EmbeddedNoteIndexer(repository, embedding);
		const note = noteBuilder({ plainText: 'architecture' });
		await indexer.index(testActor(), note);
		const firstVector = repository.documents[0]?.document.embedding;
		await indexer.index(testActor(), { ...note, currentRevision: 2 });
		expect(repository.documents[0]?.document.embedding).toEqual(firstVector);
	});

	it('re-embeds unchanged content when the embedding model changes', async () => {
		const repository = new InMemorySearchRepository();
		const embedding = new InMemoryEmbeddingClient();
		const indexer = new EmbeddedNoteIndexer(repository, embedding);
		const note = noteBuilder({ plainText: 'architecture' });
		await indexer.index(testActor(), note);
		embedding.model = 'fake-embedding-v2';
		await indexer.index(testActor(), { ...note, currentRevision: 2 });
		expect(repository.documents[0]?.document.embeddingModel).toBe('fake-embedding-v2');
	});

	it('replaces stale chunks after content changes', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedNoteIndexer(repository, new InMemoryEmbeddingClient());
		const note = noteBuilder({ plainText: 'old content' });
		await indexer.index(testActor(), note);
		await indexer.index(testActor(), { ...note, plainText: 'new content', currentRevision: 2 });
		expect(repository.documents.map((item) => item.document.content)).toEqual(['new content']);
	});

	it('removes stale chunks when a note becomes empty', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedNoteIndexer(repository, new InMemoryEmbeddingClient());
		const note = noteBuilder({ plainText: 'old content' });
		await indexer.index(testActor(), note);
		await indexer.index(testActor(), { ...note, plainText: '', currentRevision: 2 });
		expect(repository.documents).toEqual([]);
	});

	it('rejects an embedding count mismatch', async () => {
		const repository = new InMemorySearchRepository();
		const embedding = new InMemoryEmbeddingClient();
		embedding.returnWrongCount = true;
		const indexer = new EmbeddedNoteIndexer(repository, embedding);
		await expect(
			indexer.index(testActor(), noteBuilder({ plainText: 'architecture' }))
		).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
	});
});

describe('Diagram indexing invariants', () => {
	it('stores diagram text as a diagram-scoped search document', async () => {
		const repository = new InMemorySearchRepository();
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const diagram = diagramBuilder();
		await new EmbeddedDiagramIndexer(repository, new InMemoryEmbeddingClient(), notes).index(
			testActor(),
			diagram
		);
		expect(repository.documents[0]?.document.diagramId).toBe(diagram.id);
	});

	it('keeps note chunks when replacing diagram chunks', async () => {
		const repository = new InMemorySearchRepository();
		const notes = new InMemoryNoteContent();
		const note = noteBuilder({ plainText: 'note content' });
		notes.notes = [note];
		await new EmbeddedNoteIndexer(repository, new InMemoryEmbeddingClient()).index(
			testActor(),
			note
		);
		const indexer = new EmbeddedDiagramIndexer(repository, new InMemoryEmbeddingClient(), notes);
		const diagram = diagramBuilder();
		await indexer.index(testActor(), diagram);
		await indexer.index(testActor(), { ...diagram, searchableText: 'revised diagram' });
		expect(repository.documents.filter((item) => !item.document.diagramId)).toHaveLength(1);
	});

	it('removes only diagram chunks when searchable text becomes empty', async () => {
		const repository = new InMemorySearchRepository();
		const notes = new InMemoryNoteContent();
		const note = noteBuilder({ plainText: 'note content' });
		notes.notes = [note];
		await new EmbeddedNoteIndexer(repository, new InMemoryEmbeddingClient()).index(
			testActor(),
			note
		);
		const indexer = new EmbeddedDiagramIndexer(repository, new InMemoryEmbeddingClient(), notes);
		const diagram = diagramBuilder();
		await indexer.index(testActor(), diagram);
		await indexer.index(testActor(), { ...diagram, searchableText: '' });
		expect(repository.documents.map((item) => item.document.content)).toEqual(['note content']);
	});

	// A studio diagram belongs to its project and never to a note, so the indexer
	// must not go looking for one — the note reader would throw.
	it('indexes a diagram that has no source note', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedDiagramIndexer(
			repository,
			new InMemoryEmbeddingClient(),
			new InMemoryNoteContent()
		);
		const diagram = diagramBuilder({ sourceNoteId: undefined, title: 'Delivery pipeline' });
		await indexer.index(testActor(), diagram);
		expect(repository.documents[0]?.document.projectId).toBe(diagram.projectId);
	});

	// The chunk is a bare list of labels, so the title is the only context the
	// reranker gets. An untitled studio diagram indexed with an empty title would
	// rank on labels alone and effectively disappear.
	it('titles an untitled note-less diagram rather than indexing it blank', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedDiagramIndexer(
			repository,
			new InMemoryEmbeddingClient(),
			new InMemoryNoteContent()
		);
		await indexer.index(testActor(), diagramBuilder({ sourceNoteId: undefined, title: undefined }));
		expect(repository.documents[0]?.document.sourceTitle).toBe('Diagram: Untitled diagram');
	});

	// A diagram chunk is its own retrieval source now: carrying the note as well
	// would violate the single-source constraint the database enforces.
	it('leaves the note off a diagram chunk so it stands as its own source', async () => {
		const repository = new InMemorySearchRepository();
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const indexer = new EmbeddedDiagramIndexer(repository, new InMemoryEmbeddingClient(), notes);
		await indexer.index(testActor(), diagramBuilder());
		expect(repository.documents[0]?.document.noteId).toBeUndefined();
	});
});

describe('Memory indexing invariants', () => {
	it('stores memory content as a memory-scoped search document', async () => {
		const repository = new InMemorySearchRepository();
		const entry = memoryEntryBuilder();
		await new EmbeddedMemoryIndexer(repository, new InMemoryEmbeddingClient()).index(
			testActor(),
			entry
		);
		expect(repository.documents[0]?.document.memoryEntryId).toBe(entry.id);
	});

	it('gives memory chunks no note source', async () => {
		const repository = new InMemorySearchRepository();
		await new EmbeddedMemoryIndexer(repository, new InMemoryEmbeddingClient()).index(
			testActor(),
			memoryEntryBuilder()
		);
		expect(repository.documents[0]?.document.noteId).toBeUndefined();
	});

	it('reuses a chunk with an unchanged content hash', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedMemoryIndexer(repository, new InMemoryEmbeddingClient());
		const entry = memoryEntryBuilder();
		await indexer.index(testActor(), entry);
		const firstId = repository.documents[0]?.document.id;
		await indexer.index(testActor(), entry);
		expect(repository.documents[0]?.document.id).toBe(firstId);
	});

	it('removes chunks for an entry withheld from agents', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedMemoryIndexer(repository, new InMemoryEmbeddingClient());
		const entry = memoryEntryBuilder();
		await indexer.index(testActor(), entry);
		await indexer.index(testActor(), { ...entry, shareWithAgents: false });
		expect(repository.documents).toEqual([]);
	});

	it('removes chunks for a deleted entry', async () => {
		const repository = new InMemorySearchRepository();
		const indexer = new EmbeddedMemoryIndexer(repository, new InMemoryEmbeddingClient());
		const entry = memoryEntryBuilder();
		await indexer.index(testActor(), entry);
		await indexer.index(testActor(), { ...entry, deletedAt: testNow });
		expect(repository.documents).toEqual([]);
	});
});
