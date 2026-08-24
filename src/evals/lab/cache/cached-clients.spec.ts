import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import type { Reranker } from '$lib/server/services/knowledge-search/contracts';
import { describe, expect, it } from 'vitest';
import { CachedReranker, rerankerCacheKey } from './cached-clients';
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

class ReverseReranker implements Reranker {
	async rerank(_query: string, matches: readonly SearchMatch[], topN: number) {
		return [...matches].reverse().slice(0, topN);
	}
}

class ThrowingReranker implements Reranker {
	async rerank(): Promise<readonly SearchMatch[]> {
		throw new Error('cached order should replay');
	}
}

describe('reranker cache provenance', () => {
	it('invalidates a ranking when document content changes', () => {
		expect(rerankerCacheKey('incident', [match('old procedure')], 1)).not.toBe(
			rerankerCacheKey('incident', [match('new procedure')], 1)
		);
	});

	it('replays a ranked order across fresh document ids', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-rerank-cache-'));
		const path = join(directory, 'cache.json');
		try {
			const recordedCache = new DiskCache(path);
			const recorded = new CachedReranker(new ReverseReranker(), recordedCache);
			await recorded.rerank('incident', [match('alpha', 'old-a'), match('beta', 'old-b')], 2);
			await recordedCache.flush();
			const replayed = await new CachedReranker(new ThrowingReranker(), new DiskCache(path)).rerank(
				'incident',
				[match('alpha', 'new-a'), match('beta', 'new-b')],
				2
			);
			expect(replayed.map((item) => item.document.content)).toEqual(['beta', 'alpha']);
		} finally {
			await rm(directory, { recursive: true });
		}
	});
});
