import { describe, expect, it } from 'vitest';
import {
	InMemoryToolEmbeddingRepository,
	RecordingEmbeddings
} from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { EmbeddedToolRetriever, PgToolRetriever } from './tool-retriever';

const vector = (seed: number) => Array.from({ length: 4 }, (_, index) => (index === seed ? 1 : 0));

const catalog = [
	{ name: 'create_note', description: 'Create a note' },
	{ name: 'archive_note', description: 'Archive a note' },
	{ name: 'pin_note', description: 'Pin a note' }
];

const setup = (ranked: string[], vectors = [vector(0)]) => {
	const embeddings = new RecordingEmbeddings();
	embeddings.vectors = vectors;
	const repository = new InMemoryToolEmbeddingRepository();
	repository.ranked = ranked;
	return { embeddings, repository, retriever: new PgToolRetriever(embeddings, repository) };
};

describe('EmbeddedToolRetriever', () => {
	it('is available as a domain service', () => {
		expect(EmbeddedToolRetriever).toBeTypeOf('function');
	});
});

describe('PgToolRetriever', () => {
	it('embeds only the query, not the catalog', async () => {
		const { embeddings, retriever } = setup(['archive_note']);
		await retriever.retrieve(catalog, 'tidy up old notes', 2);
		expect(embeddings.requests).toEqual([['tidy up old notes']]);
	});

	it('ranks the whole catalog so missing rows can be reported', async () => {
		const { repository, retriever } = setup(['archive_note']);
		await retriever.retrieve(catalog, 'tidy up old notes', 2);
		expect(repository.rankings).toEqual([
			{ names: ['create_note', 'archive_note', 'pin_note'], limit: 3 }
		]);
	});

	it('caps the repository ranking at topN', async () => {
		const { retriever } = setup(['archive_note', 'create_note', 'pin_note']);
		expect(await retriever.retrieve(catalog, 'notes', 2)).toEqual(['archive_note', 'create_note']);
	});

	it('returns nothing for an empty catalog without calling the embedder', async () => {
		const { embeddings, retriever } = setup([]);
		await retriever.retrieve([], 'anything', 5);
		expect(embeddings.requests).toEqual([]);
	});

	it('returns nothing when the embedder yields no vector', async () => {
		const { retriever } = setup([], []);
		expect(await retriever.retrieve(catalog, 'anything', 5)).toEqual([]);
	});

	it('warns about catalog tools that have no stored vector yet', async () => {
		const warnings: string[] = [];
		const original = console.warn;
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};
		try {
			const { retriever } = setup(['create_note', 'archive_note']);
			await retriever.retrieve(catalog, 'notes', 5);
		} finally {
			console.warn = original;
		}
		expect(warnings[0]).toContain('pin_note');
	});
});
