import type { Database } from '$lib/server/db';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';
import { KnowledgeIndexMaintenance } from '$lib/server/services/knowledge-search/index-maintenance';
import {
	ContentIndex,
	retrievalChunkerFromEnv
} from '$lib/server/services/knowledge-search/indexing';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SearchRanking } from '$lib/server/services/knowledge-search/ranking';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import type { Reranker } from '$lib/server/services/knowledge-search/contracts';
import type { EmbeddingClient } from '$lib/server/services/knowledge-search/contracts';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { operationObserver } from '$lib/server/services/telemetry';
import { optionalProperty, positiveNumberFromEnvironment } from '$lib/server/config';
import {
	SearchQueryGeneration,
	type ISearchQueryGeneration
} from '$lib/server/services/knowledge-search/query-generation';
import {
	PgToolRetriever,
	type ToolRetriever
} from '$lib/server/services/agent/tools/tool-retriever';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import type { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { InlineSuggestionAdmission } from '$lib/server/services/inline-suggestions/inline-admission';
import { InlineSuggestionCompletion } from '$lib/server/services/inline-suggestions/inline-completion';

export interface KnowledgeSearchCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly embeddingClient?: EmbeddingClient;
	readonly reranker?: Reranker;
	readonly queryGenerator?: ISearchQueryGeneration;
	readonly deferEmbedding: boolean;
}

export interface KnowledgeSearchCapability {
	readonly repository: KnowledgeIndexRecords;
	readonly embeddingClient: EmbeddingClient;
	readonly reranker: Reranker;
	readonly queryGenerator: ISearchQueryGeneration;
	readonly attachmentIndexer: ContentIndex['attachments'];
	readonly noteIndexer: ContentIndex['notes'];
	readonly diagramIndexer: ReturnType<ContentIndex['diagrams']>;
	readonly memoryIndexer: ContentIndex['memories'];
	readonly lookup: KnowledgeLookup;
	readonly relationshipClassifier: RelationshipDiscovery;
	readonly maintenance: KnowledgeIndexMaintenance;
	readonly toolRetriever: ToolRetriever;
	readonly finalize: (input: KnowledgeSearchFinalizeInput) => KnowledgeSearchFinalized;
}

export interface KnowledgeSearchFinalizeInput {
	readonly preferences: AgentPreferenceCatalog;
}

export interface KnowledgeSearchFinalized {
	readonly preferences: AgentPreferenceCatalog;
	readonly inlineCompletion: InlineSuggestionCompletion;
	readonly observer: typeof operationObserver;
	readonly inlineAdmission: InlineSuggestionAdmission;
}

export const createKnowledgeSearchCapability = (
	input: KnowledgeSearchCapabilityInput
): KnowledgeSearchCapability => {
	const repository = new KnowledgeIndexRecords(input.db);
	const embeddingClient =
		input.embeddingClient ??
		new Embeddings(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		});
	const reranker =
		input.reranker ??
		new SearchRanking(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		});
	const chunker = retrievalChunkerFromEnv();
	const queryGenerator =
		input.queryGenerator ??
		new SearchQueryGeneration(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		});
	const index = new ContentIndex(repository, embeddingClient, chunker, input.deferEmbedding);

	return {
		repository,
		embeddingClient,
		toolRetriever: new PgToolRetriever(embeddingClient, new ToolEmbeddingRecords(input.db)),
		finalize: ({ preferences }) => ({
			preferences,
			inlineCompletion: new InlineSuggestionCompletion(input.openRouterApiKey, {
				baseURL: input.openRouterBaseURL,
				appURL: input.appURL,
				observer: operationObserver
			}),
			observer: operationObserver,
			inlineAdmission: new InlineSuggestionAdmission()
		}),
		reranker,
		queryGenerator,
		attachmentIndexer: index.attachments,
		noteIndexer: index.notes,
		diagramIndexer: index.diagrams(new NoteRecords(input.db)),
		memoryIndexer: index.memories,
		lookup: new KnowledgeLookup(repository),
		relationshipClassifier: new RelationshipDiscovery({ observer: operationObserver }),
		maintenance: new KnowledgeIndexMaintenance(
			repository,
			embeddingClient,
			input.transactionRunner,
			{
				...optionalProperty(
					'intervalMs',
					positiveNumberFromEnvironment('EMBEDDING_SWEEP_INTERVAL_MS')
				),
				...optionalProperty(
					'maxSourcesPerTick',
					positiveNumberFromEnvironment('EMBEDDING_SWEEP_MAX_SOURCES')
				)
			}
		)
	};
};
