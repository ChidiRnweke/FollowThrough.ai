import type { InlineSuggestionThrottle } from '$lib/models/agent';
import { normalizeLanguageModelId } from '$lib/models/agent';
import type { ScheduledTask } from '$lib/models/maintenance';
import type { TokenCodec } from '$lib/models/tokenization';
import { Cl100kTokenizer } from '$lib/server/adapters/tokenization/cl100k';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import {
	ToolDiscovery,
	type ToolRetriever
} from '$lib/server/controllers/tool-discovery/controller';
import type { Database } from '$lib/server/db';
import { createContentIndex } from '$lib/server/factories/content-index';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import {
	InlineContextService,
	type IInlineContextService
} from '$lib/server/services/inline-suggestions/inline-context';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';
import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import type {
	AttachmentIndexing,
	DiagramIndexing,
	IndexCompletion,
	MemoryIndexing,
	NoteIndexing,
	WidgetIndexing
} from '$lib/server/services/knowledge-search/indexing';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';

import { optionalProperty, positiveNumberFromEnvironment } from '$lib/server/config';
import type { AgentToolDiscoveryServices } from '$lib/server/factories/agent/tool-discovery-factory';
import { createInlineAdmission } from '$lib/server/factories/inline-admission';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { AgentPreferenceEditor } from '$lib/server/services/agent/runs/preferences';
import {
	InlineSuggestionCompletion,
	type IInlineSuggestionCompletion
} from '$lib/server/services/inline-suggestions/inline-completion';
import type { Reranker } from '$lib/models/knowledge-search';
import type { EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import {
	SearchQueryGeneration,
	type ISearchQueryGeneration
} from '$lib/server/services/knowledge-search/query-generation';
import { SearchRanking } from '$lib/server/adapters/knowledge-search/ranking';
import {
	KnowledgeLookup,
	type IKnowledgeLookup
} from '$lib/server/services/knowledge-search/semantic';
import { operationObserver } from '$lib/server/services/telemetry';

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
	readonly tokenizer: TokenCodec;
	readonly repository: RetrievalIndexRepository;
	readonly indexWriter: IndexCompletion;
	readonly embeddingClient: EmbeddingClient;
	readonly reranker: Reranker;
	readonly queryGenerator: ISearchQueryGeneration;
	readonly attachmentIndexer: AttachmentIndexing;
	readonly noteIndexer: NoteIndexing;
	readonly diagramIndexer: DiagramIndexing;
	readonly memoryIndexer: MemoryIndexing;
	readonly widgetIndexer: WidgetIndexing;
	readonly lookup: IKnowledgeLookup;
	readonly maintenance: ScheduledTask;
	readonly toolRetriever: ToolRetriever;
	readonly toolDiscovery: AgentToolDiscoveryServices;
	readonly finalize: (input: KnowledgeSearchFinalizeInput) => KnowledgeSearchFinalized;
}

export interface KnowledgeSearchFinalizeInput {
	readonly preferences: AgentPreferenceEditor;
}

export interface KnowledgeSearchFinalized {
	readonly preferences: AgentPreferenceEditor;
	readonly inlineCompletion: IInlineSuggestionCompletion;
	readonly inlineContext: IInlineContextService;
	readonly observer: typeof operationObserver;
	readonly inlineAdmission: InlineSuggestionThrottle;
}

export const createKnowledgeSearchCapability = (
	input: KnowledgeSearchCapabilityInput
): KnowledgeSearchCapability => {
	const tokenizer = new Cl100kTokenizer();
	const repository = new KnowledgeIndexRecords(input.db);
	const embeddingClient =
		input.embeddingClient ??
		new Embeddings(input.openRouterApiKey, tokenizer, {
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
	const chunker = {
		targetTokens: Number(process.env.RETRIEVAL_CHUNK_TOKENS ?? 2400),
		overlapTokens: Number(process.env.RETRIEVAL_CHUNK_OVERLAP_TOKENS ?? 480)
	};
	const queryGenerator =
		input.queryGenerator ??
		new SearchQueryGeneration(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		});
	const index = createContentIndex(
		repository,
		embeddingClient.model,
		tokenizer,
		chunker,
		input.deferEmbedding
	);

	return {
		tokenizer,
		repository,
		indexWriter: index,
		embeddingClient,
		toolRetriever: new ToolDiscovery(
			new ToolCatalogIndex(new ToolEmbeddingRecords(input.db)),
			embeddingClient,
			input.transactionRunner,
			new AgentToolCatalogService()
		),
		toolDiscovery: {
			index: new ToolCatalogIndex(new ToolEmbeddingRecords(input.db)),
			embeddings: embeddingClient
		},
		finalize: ({ preferences }) => ({
			inlineContext: new InlineContextService(tokenizer),
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
		attachmentIndexer: index,
		noteIndexer: index,
		diagramIndexer: index,
		memoryIndexer: index,
		widgetIndexer: index,
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
