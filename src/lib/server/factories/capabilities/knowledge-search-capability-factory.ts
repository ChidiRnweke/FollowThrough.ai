import type { ScheduledTask } from '$lib/models/maintenance';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import type { InlineSuggestionThrottle } from '$lib/models/agent';
import { normalizeLanguageModelId } from '$lib/services/agent/model-selection';
import { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import type { Database } from '$lib/server/db';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import {
	ContentIndex,
	retrievalChunkerFromEnv
} from '$lib/server/services/knowledge-search/indexing';
import { SearchRanking } from '$lib/server/services/knowledge-search/ranking';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import type { Reranker } from '$lib/server/services/knowledge-search/contracts';
import type { EmbeddingClient } from '$lib/server/services/knowledge-search/contracts';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { operationObserver } from '$lib/server/services/telemetry';
import { optionalProperty, positiveNumberFromEnvironment } from '$lib/server/config';
import {
	SearchQueryGeneration,
	type ISearchQueryGeneration
} from '$lib/server/services/knowledge-search/query-generation';
import {
	ToolDiscovery,
	type ToolRetriever
} from '$lib/server/controllers/tool-discovery/controller';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import type { AgentPreferenceEditor } from '$lib/server/services/agent/runs/preferences';
import { createInlineAdmission } from '$lib/server/factories/inline-admission';
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
	readonly indexWriter: ContentIndex;
	readonly embeddingClient: EmbeddingClient;
	readonly reranker: Reranker;
	readonly queryGenerator: ISearchQueryGeneration;
	readonly attachmentIndexer: ContentIndex['attachments'];
	readonly noteIndexer: ContentIndex['notes'];
	readonly diagramIndexer: ContentIndex['diagrams'];
	readonly memoryIndexer: ContentIndex['memories'];
	readonly widgetIndexer: ContentIndex['widgets'];
	readonly lookup: KnowledgeLookup;
	readonly maintenance: ScheduledTask;
	readonly toolRetriever: ToolRetriever;
	readonly finalize: (input: KnowledgeSearchFinalizeInput) => KnowledgeSearchFinalized;
}

export interface KnowledgeSearchFinalizeInput {
	readonly preferences: AgentPreferenceEditor;
}

export interface KnowledgeSearchFinalized {
	readonly preferences: AgentPreferenceEditor;
	readonly inlineCompletion: InlineSuggestionCompletion;
	readonly observer: typeof operationObserver;
	readonly inlineAdmission: InlineSuggestionThrottle;
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
	const index = new ContentIndex(repository, embeddingClient.model, chunker, input.deferEmbedding);

	return {
		repository,
		indexWriter: index,
		embeddingClient,
		toolRetriever: new ToolDiscovery(
			new ToolCatalogIndex(new ToolEmbeddingRecords(input.db)),
			embeddingClient,
			input.transactionRunner
		),
		finalize: ({ preferences }) => ({
			preferences,
			inlineCompletion: new InlineSuggestionCompletion(input.openRouterApiKey, {
				model: normalizeLanguageModelId(
					process.env.OPENROUTER_INLINE_COMPLETION_MODEL ??
						process.env.OPENROUTER_INLINE_MODEL ??
						'deepseek/deepseek-v4-flash'
				),
				baseURL: input.openRouterBaseURL,
				appURL: input.appURL,
				observer: operationObserver
			}),
			observer: operationObserver,
			inlineAdmission: createInlineAdmission()
		}),
		reranker,
		queryGenerator,
		attachmentIndexer: index.attachments,
		noteIndexer: index.notes,
		diagramIndexer: index.diagrams,
		memoryIndexer: index.memories,
		widgetIndexer: index.widgets,
		lookup: new KnowledgeLookup(repository),
		maintenance: new EmbeddingMaintenance(
			new IndexBacklog(repository),
			embeddingClient,
			input.transactionRunner,
			new EmbeddingProgressStore(),
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
