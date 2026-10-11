import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { cachedRetrievalFetch } from './cached-clients';
import { DiskCache, encodeVector } from './disk-cache';

const embed = (fetch: typeof globalThis.fetch, input: readonly string[]) =>
	fetch('https://provider.test/v1/embeddings', {
		method: 'POST',
		body: JSON.stringify({ model: 'eval-model', input })
	}).then((response) => response.json());

it('replays embeddings by model and content while preserving requested order and new content', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'retrieval-embedding-cache-'));
	const path = join(directory, 'cache.json');
	try {
		const provider = new InMemoryRetrievalProvider();
		provider.vectorsByContent.set('alpha', [0.25, 0.5]);
		provider.vectorsByContent.set('beta', [0.75, 1]);
		const cache = new DiskCache(path);
		const fetch = cachedRetrievalFetch(cache, provider.fetch);
		await embed(fetch, ['alpha']);
		provider.rejectedContents.add('alpha');
		const replay = await embed(fetch, ['beta', 'alpha']);
		await cache.flush();
		expect({
			replay: replay.data.map((item: { embedding: number[] }) => item.embedding),
			saved: JSON.parse(await readFile(path, 'utf8'))
		}).toEqual({
			replay: [
				[0.75, 1],
				[0.25, 0.5]
			],
			saved: {
				[DiskCache.key('embed', { model: 'eval-model', content: 'alpha' })]: encodeVector([
					0.25, 0.5
				]),
				[DiskCache.key('embed', { model: 'eval-model', content: 'beta' })]: encodeVector([0.75, 1])
			}
		});
	} finally {
		await rm(directory, { recursive: true });
	}
});
