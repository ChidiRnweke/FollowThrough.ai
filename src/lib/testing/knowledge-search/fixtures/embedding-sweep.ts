import type { ScheduledTask } from '$lib/models/maintenance';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import {
	EmbeddingBacklog,
	KnowledgeIndexing
} from '$lib/server/controllers/knowledge-indexing/controller';
import { IndexBacklogService } from '$lib/server/services/knowledge-search/backlog';
import { embeddingBackfill, type TaskLogger } from '../../../../worker-tasks';
import type { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	InMemoryRetrievalProvider,
	type RetrievalProviderDouble
} from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { InMemoryMaintenanceProgress } from '$lib/testing/maintenance/fakes/in-memory-maintenance-progress';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { createTestContentIndex } from './content-index';

/** Any failure in a sweep fails the test, unless the scenario expects failed sources. */
export const failingTaskLogger: TaskLogger = {
	error: (message, error) => {
		throw error instanceof Error ? error : new Error(message);
	},
	log: () => {}
};

/** The worker's embedding tick over one in-memory index, with its real controllers. */
export const inMemoryEmbeddingSweep = (
	repository: InMemorySearchRepository,
	provider: RetrievalProviderDouble = new InMemoryRetrievalProvider(),
	options: {
		maxSourcesPerTick?: number;
		logger?: TaskLogger;
		transactions?: TransactionRunner;
	} = {}
): ScheduledTask => {
	const progress = new InMemoryMaintenanceProgress();
	return embeddingBackfill(
		{
			backlog: () => new EmbeddingBacklog(new IndexBacklogService(repository), progress),
			indexingFor: () =>
				new KnowledgeIndexing(
					createTestContentIndex(repository, provider.model, undefined, false, provider),
					options.transactions ?? new InMemoryTransactionRunner([repository])
				)
		},
		{ intervalMs: 1, maxSourcesPerTick: options.maxSourcesPerTick ?? 200 },
		options.logger ?? failingTaskLogger
	);
};
