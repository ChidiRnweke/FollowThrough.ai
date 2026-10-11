import type { MaintenanceProgress } from '$lib/server/services/maintenance/progress';
import type { IndexSource, PendingIndexSource } from '$lib/models/knowledge-search';
import type { IndexBacklog } from '$lib/server/services/knowledge-search/backlog';
import type { IndexBackfill } from '$lib/server/services/knowledge-search/retrieval';

interface TransactionRunner {
	run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * The embedding backlog across every user. There is no job table: the queue is `search_chunks`
 * rows with no embedding, so the backlog is exactly the durable state and a crashed tick simply
 * leaves work for the next one. The caller embeds each listed source as its owner.
 */
export interface EmbeddingBacklogController {
	/** The next sources to embed, continuing the saved traversal or restarting it when it ran out. */
	next(limit: number): Promise<readonly PendingIndexSource[]>;
	/** Records that the traversal has passed a source, whether or not it embedded. */
	advance(cursor: string): Promise<void>;
}
export class EmbeddingBacklog implements EmbeddingBacklogController {
	constructor(
		private readonly backlog: IndexBacklog,
		private readonly progress: MaintenanceProgress
	) {}
	async next(limit: number): Promise<readonly PendingIndexSource[]> {
		const resumed = await this.progress.resume(EMBEDDING_BACKFILL);
		const pending = await this.backlog.pendingSources(limit, resumed?.after);
		if (pending.length || !resumed) return pending;
		await this.progress.restart(EMBEDDING_BACKFILL);
		return this.backlog.pendingSources(limit);
	}
	advance(cursor: string): Promise<void> {
		return this.progress.advance(EMBEDDING_BACKFILL, { after: cursor });
	}
}

/** Fills in the vectors that the user's write path deliberately skipped. */
export interface KnowledgeIndexingController {
	/** Embed one source's pending chunks; answers how many chunks were embedded. */
	backfill(source: IndexSource): Promise<number>;
}
export class KnowledgeIndexing implements KnowledgeIndexingController {
	constructor(
		private readonly index: IndexBackfill,
		private readonly transactions: TransactionRunner
	) {}
	async backfill(source: IndexSource): Promise<number> {
		// Embedding happens outside the transaction: it is a network call to a third
		// party, and holding row locks across it is the very thing this worker exists
		// to stop the request path from doing.
		const embedded = await this.index.embedPending(source);
		if (!embedded.chunks.length) return 0;
		await this.transactions.run(() => this.index.completePending(embedded));
		return embedded.chunks.length;
	}
}

/** The maintenance traversal the embedding backlog resumes from. */
const EMBEDDING_BACKFILL = 'embedding-backfill';
