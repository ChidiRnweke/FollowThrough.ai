import { describe, expect, it } from 'vitest';
import { EmbeddedDiagramIndexer, EmbeddedNoteIndexer, ParagraphChunker } from './indexing';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/fakes/in-memory-search';
import { noteBuilder, testActor } from '$lib/testing/fixtures/domain-builders';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import type { Diagram, DiagramId } from '$lib/models';

const diagramBuilder = (overrides: Partial<Diagram> = {}): Diagram => ({
	id: '00000000-0000-4000-8000-000000000090' as DiagramId,
	userId: testActor().userId,
	noteId: noteBuilder().id,
	kind: 'mermaid',
	source: 'flowchart LR\nA --> B',
	searchableText: 'Service A calls Service B',
	createdAt: noteBuilder().createdAt,
	updatedAt: noteBuilder().updatedAt,
	...overrides
});

describe('Content chunking invariants', () => {
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
});
