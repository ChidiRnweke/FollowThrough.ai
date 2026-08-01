import { describe, it, expect } from 'vitest';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchMatch } from '$lib/models/knowledge-search';
import { RerankingKnowledgeSearcher, type KnowledgeSearcher, type Reranker } from './semantic';

const actor: ActorContext = { userId: 'user-1' as UserId };

const match = (content: string, score: number): SearchMatch => ({
	document: {
		id: `doc-${content}` as SearchDocument['id'],
		projectId: 'project-1' as ProjectId,
		content,
		contentHash: content,
		sourceRevision: 1,
		chunkIndex: 0
	},
	score
});

class RecordingSearcher implements KnowledgeSearcher {
	lastLimit = -1;
	constructor(private readonly results: readonly SearchMatch[]) {}
	async search(_actor: ActorContext, _query: string, limit = 10): Promise<readonly SearchMatch[]> {
		this.lastLimit = limit;
		return this.results.slice(0, limit);
	}
}

class TopNReranker implements Reranker {
	async rerank(_query: string, matches: readonly SearchMatch[], topN: number) {
		return matches.slice(0, topN);
	}
}

class ThrowingReranker implements Reranker {
	async rerank(): Promise<readonly SearchMatch[]> {
		throw new Error('reranker should not be called');
	}
}

const wide = Array.from({ length: 60 }, (_, i) => match(`c${i}`, 1 - i / 100));

describe('RerankingKnowledgeSearcher', () => {
	it('requests a wide candidate set from the inner searcher', async () => {
		const inner = new RecordingSearcher(wide);
		await new RerankingKnowledgeSearcher(inner, new TopNReranker()).search(actor, 'query', 10);
		expect(inner.lastLimit).toBe(50);
	});

	it('narrows the reranked candidates down to the requested limit', async () => {
		const searcher = new RerankingKnowledgeSearcher(
			new RecordingSearcher(wide),
			new TopNReranker()
		);
		const results = await searcher.search(actor, 'query', 8);
		expect(results).toHaveLength(8);
	});

	it('returns nothing for a blank query without searching', async () => {
		const inner = new RecordingSearcher(wide);
		const results = await new RerankingKnowledgeSearcher(inner, new TopNReranker()).search(
			actor,
			'   ',
			8
		);
		expect(results).toHaveLength(0);
	});

	it('skips reranking when the candidate set is already within the limit', async () => {
		const inner = new RecordingSearcher([match('a', 0.9), match('b', 0.8)]);
		const results = await new RerankingKnowledgeSearcher(inner, new ThrowingReranker()).search(
			actor,
			'query',
			10
		);
		expect(results).toHaveLength(2);
	});
});
