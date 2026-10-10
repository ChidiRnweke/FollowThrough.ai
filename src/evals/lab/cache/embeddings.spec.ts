import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { CachedEmbeddingClient } from './cached-clients';
import { DiskCache, encodeVector } from './disk-cache';

it('replays embeddings by model and content while preserving requested order and new content', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'retrieval-embedding-cache-'));
	const path = join(directory, 'cache.json');
	try {
		const provider = new InMemoryEmbeddingClient();
		provider.vectorsByContent.set('alpha', [0.25, 0.5]);
		provider.vectorsByContent.set('beta', [0.75, 1]);
		const cache = new DiskCache(path);
		const client = new CachedEmbeddingClient(provider, cache);
		await client.embed(['alpha']);
		provider.rejectedContents.add('alpha');
		const replay = await client.embed(['beta', 'alpha']);
		await cache.flush();
		expect({ replay, saved: JSON.parse(await readFile(path, 'utf8')) }).toEqual({
			replay: {
				model: provider.model,
				vectors: [
					[0.75, 1],
					[0.25, 0.5]
				]
			},
			saved: {
				[DiskCache.key('embed', { model: provider.model, content: 'alpha' })]: encodeVector([
					0.25, 0.5
				]),
				[DiskCache.key('embed', { model: provider.model, content: 'beta' })]: encodeVector([
					0.75, 1
				])
			}
		});
	} finally {
		await rm(directory, { recursive: true });
	}
});
