import type { PendingIndexSource } from '$lib/models/knowledge-search';
import type { RetrievalBacklogRepository } from '$lib/server/repositories/knowledge-search';

/** Index sources whose chunks still need vectors, across every user, in cursor order. */
export interface IndexBacklog {
	pendingSources(limit: number, after?: string): Promise<readonly PendingIndexSource[]>;
}
export class IndexBacklogService implements IndexBacklog {
	constructor(private readonly repository: RetrievalBacklogRepository) {}
	pendingSources(limit: number, after?: string) {
		return this.repository.listPendingSources(limit, after);
	}
}
