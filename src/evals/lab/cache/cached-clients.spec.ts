import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import { describe, expect, it } from 'vitest';
import { cachedRetrievalFetch, rerankerCacheKey } from './cached-clients';
import { DiskCache } from './disk-cache';

const match = (content: string, id = `document-${content}`): SearchMatch => ({
	document: {
		id: id as SearchDocumentId,
		projectId: 'project-1' as ProjectId,
		sourceTitle: 'Runbook',
		content,
		contentHash: 'fixture-hash',
		sourceRevision: 1,
		chunkIndex: 0
	},
	score: 0.8
});

/** Title, optional section and content: the reranker document text knowledge search sends. */
const text = (item: SearchMatch): string =>
	[
		`Title: ${JSON.stringify(item.document.sourceTitle)}`,
		...(item.document.sectionPath ? [`Section: ${JSON.stringify(item.document.sectionPath)}`] : []),
		`Content: |-\n  ${item.document.content}`
	].join('\n');

const rerank = (fetch: typeof globalThis.fetch, documents: readonly string[]) =>
	fetch('https://provider.test/v1/rerank', {
		method: 'POST',
		body: JSON.stringify({ query: 'incident', documents, top_n: documents.length })
	}).then((response) => response.json());

const reversing: typeof globalThis.fetch = async (_url, init) => {
	const documents: string[] = JSON.parse(String(init?.body)).documents;
	return Response.json({
		results: documents.map((_, index) => ({ index: documents.length - 1 - index }))
	});
};
const throwing: typeof globalThis.fetch = async () => {
	throw new Error('cached order should replay');
};

describe('reranker cache provenance', () => {
	it('invalidates a ranking when document content changes', () => {
		expect(rerankerCacheKey('incident', [text(match('old procedure'))], 1)).not.toBe(
			rerankerCacheKey('incident', [text(match('new procedure'))], 1)
		);
	});

	it('replays a ranked order across fresh document ids', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-rerank-cache-'));
		const path = join(directory, 'cache.json');
		try {
			const recordedCache = new DiskCache(path);
			await rerank(cachedRetrievalFetch(recordedCache, reversing), [
				text(match('alpha', 'old-a')),
				text(match('beta', 'old-b'))
			]);
			await recordedCache.flush();
			const replayed = await rerank(cachedRetrievalFetch(new DiskCache(path), throwing), [
				text(match('alpha', 'new-a')),
				text(match('beta', 'new-b'))
			]);
			expect(replayed.results.map((result: { index: number }) => result.index)).toEqual([1, 0]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});
});

it('preserves the existing cache identity including uncapped topN', () => {
	expect(rerankerCacheKey('incident', [text(match('alpha'))], 8)).toBe(
		'rerank:e2079c8f8e31b5830d69038011f0f12e'
	);
});
it.each(['sourceTitle', 'sectionPath'] as const)('invalidates ranking when %s changes', (field) => {
	const original = match('alpha');
	const changed = { ...original, document: { ...original.document, [field]: 'Changed context' } };
	expect(rerankerCacheKey('incident', [text(changed)], 1)).not.toBe(
		rerankerCacheKey('incident', [text(original)], 1)
	);
});
