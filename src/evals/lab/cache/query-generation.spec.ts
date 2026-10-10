import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSearchQueryGeneration } from '$lib/server/factories/retrieval-providers';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchHistory } from '$lib/testing/knowledge-search/fixtures/query-generation';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
import { DiskSearchQueryCache } from './cached-clients';
import { DiskCache } from './disk-cache';

const transcript = 'first question\nmore context\nuser: follow up';
const key = DiskCache.key('search-query-v2', { text: transcript });
const withCache = async (use: (path: string) => Promise<void>) => {
	const directory = await mkdtemp(join(tmpdir(), 'retrieval-query-cache-'));
	try {
		await use(join(directory, 'cache.json'));
	} finally {
		await rm(directory, { recursive: true });
	}
};
const setup = (path: string, content = '  deployment  ', status = 200) => {
	const cache = new DiskCache(path);
	const requests: string[] = [];
	const spans: string[] = [];
	const transport: typeof globalThis.fetch = async (_url, init) => {
		requests.push(String(init?.body));
		return Response.json({ choices: [{ message: { content } }] }, { status });
	};
	const { controller } = searchControllerFixture({
		queryGenerator: createSearchQueryGeneration({
			apiKey: 'test-key',
			baseURL: 'https://provider.test/v1',
			appURL: 'http://localhost:5173',
			fetch: transport
		}),
		queryCache: new DiskSearchQueryCache(cache),
		conversations: { listMessages: async () => searchHistory },
		observer: {
			run: async (name, _context, body) => {
				spans.push(name);
				return body();
			}
		}
	});
	return {
		cache,
		requests,
		spans,
		search: () =>
			controller.search(testActor(), { query: 'follow up', conversationId: testConversationId() })
	};
};

describe('controller-owned generated query caching', () => {
	it('replays existing successful strings without a provider call or generation span', async () => {
		await withCache(async (path) => {
			await writeFile(path, JSON.stringify({ [key]: 'deployment' }));
			const fixture = setup(path);
			await fixture.search();
			expect({
				requests: fixture.requests,
				spans: fixture.spans,
				stats: fixture.cache.stats()
			}).toEqual({ requests: [], spans: [], stats: { hits: 1, misses: 0, live: 0 } });
		});
	});
	it('stores trimmed output under the existing key and replays it on the next search', async () => {
		await withCache(async (path) => {
			const fixture = setup(path);
			await fixture.search();
			await fixture.search();
			await fixture.cache.flush();
			expect({
				saved: JSON.parse(await readFile(path, 'utf8')),
				requests: fixture.requests.length,
				spans: fixture.spans,
				stats: fixture.cache.stats()
			}).toEqual({
				saved: { [key]: 'deployment' },
				requests: 1,
				spans: ['knowledge_search.generate_query'],
				stats: { hits: 1, misses: 1, live: 1 }
			});
		});
	});
	it.each([
		{ name: 'empty output', content: ' \n ', status: 200 },
		{ name: 'provider rejection', content: 'unused', status: 400 }
	])('never caches $name and retries the next miss', async ({ content, status }) => {
		await withCache(async (path) => {
			const fixture = setup(path, content, status);
			const outcomes: string[] = [];
			for (let attempt = 0; attempt < 2; attempt++) {
				outcomes.push(
					await fixture.search().then(
						() => 'success',
						(error: Error) => error.message
					)
				);
			}
			expect({ outcomes, requests: fixture.requests.length, stats: fixture.cache.stats() }).toEqual(
				{
					outcomes: ['Search query generation failed', 'Search query generation failed'],
					requests: 2,
					stats: { hits: 0, misses: 2, live: 2 }
				}
			);
		});
	});
	it('bypasses a saved value in record mode and replaces it only with validated output', async () => {
		await withCache(async (path) => {
			await writeFile(path, JSON.stringify({ [key]: 'previous query' }));
			const previous = process.env.EVAL_RECORD;
			process.env.EVAL_RECORD = '1';
			try {
				const fixture = setup(path);
				await fixture.search();
				await fixture.cache.flush();
				expect({
					saved: JSON.parse(await readFile(path, 'utf8')),
					requests: fixture.requests.length,
					stats: fixture.cache.stats()
				}).toEqual({
					saved: { [key]: 'deployment' },
					requests: 1,
					stats: { hits: 0, misses: 1, live: 1 }
				});
			} finally {
				if (previous === undefined) delete process.env.EVAL_RECORD;
				else process.env.EVAL_RECORD = previous;
			}
		});
	});
	it('preserves a saved value if record-mode generation fails', async () => {
		await withCache(async (path) => {
			await writeFile(path, JSON.stringify({ [key]: 'previous query' }));
			const previous = process.env.EVAL_RECORD;
			process.env.EVAL_RECORD = '1';
			try {
				const fixture = setup(path, ' ');
				await fixture.search().then(
					() => {
						throw new Error('Expected empty output failure');
					},
					(error: Error) => error.message
				);
				await fixture.cache.flush();
				expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ [key]: 'previous query' });
			} finally {
				if (previous === undefined) delete process.env.EVAL_RECORD;
				else process.env.EVAL_RECORD = previous;
			}
		});
	});
});
