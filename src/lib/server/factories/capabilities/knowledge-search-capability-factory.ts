import type { OperationObserver, WorkflowObserver } from '$lib/models/telemetry';
import type { InlineCompletionGenerator } from '$lib/models/agent';
import {
	InlineCompletionRules,
	type IInlineCompletionRules
} from '$lib/server/services/inline-suggestions/completion-rules';
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
import {
	createEmbeddings,
	createSearchQueryGeneration
} from '$lib/server/factories/retrieval-providers';
import {
	EmbeddingBatching,
	type IEmbeddingBatching
} from '$lib/server/services/knowledge-search/embedding-batching';
import {
	SearchQueryRules,
	type ISearchQueryRules
} from '$lib/server/services/knowledge-search/query-rules';
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
import { createInlineCompletion } from '$lib/server/factories/inline-completion';
import type { Reranker } from '$lib/models/knowledge-search';
import type { EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import type { SearchQueryGenerator } from '$lib/models/knowledge-search/query-generation';
import { SearchRanking } from '$lib/server/adapters/knowledge-search/ranking';
import {
	KnowledgeLookup,
	type IKnowledgeLookup
} from '$lib/server/services/knowledge-search/semantic';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';

export interface KnowledgeSearchCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly embeddingClient?: EmbeddingClient;
	readonly reranker?: Reranker;
	readonly queryGenerator?: SearchQueryGenerator;
	readonly queryObserver?: OperationObserver;
	readonly deferEmbedding: boolean;
}

export interface KnowledgeSearchCapability {
	readonly tokenizer: TokenCodec;
	readonly repository: RetrievalIndexRepository;
	readonly indexWriter: IndexCompletion;
	readonly embeddingClient: EmbeddingClient;
	readonly reranker: Reranker;
	readonly queryGenerator: SearchQueryGenerator;
	readonly queryRules: ISearchQueryRules;
	readonly queryObserver: OperationObserver;
	readonly embeddingBatching: IEmbeddingBatching;
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
	readonly inlineCompletion: InlineCompletionGenerator;
	readonly completionRules: IInlineCompletionRules;
	readonly defaultCompletionModel: string;
	readonly inlineContext: IInlineContextService;
	readonly observer: OperationObserver;
	readonly workflow: WorkflowObserver;
	readonly inlineAdmission: InlineSuggestionThrottle;
}

export const createKnowledgeSearchCapability = (
	input: KnowledgeSearchCapabilityInput
): KnowledgeSearchCapability => {
	const { operations: operationObserver, workflows: workflowObserver } =
		createTelemetryCapability();
	const tokenizer = new Cl100kTokenizer();
	const repository = new KnowledgeIndexRecords(input.db);
	const embeddingBatching = new EmbeddingBatching(tokenizer);
	const embeddingClient =
		input.embeddingClient ??
		createEmbeddings(
			{ apiKey: input.openRouterApiKey, baseURL: input.openRouterBaseURL, appURL: input.appURL },
			operationObserver
		);
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
		createSearchQueryGeneration({
			apiKey: input.openRouterApiKey,
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL
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
			embeddingBatching,
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
			completionRules: new InlineCompletionRules(),
			defaultCompletionModel: normalizeLanguageModelId(
				process.env.OPENROUTER_INLINE_COMPLETION_MODEL ??
					process.env.OPENROUTER_INLINE_MODEL ??
					'deepseek/deepseek-v4-flash'
			),
			inlineCompletion: createInlineCompletion({
				apiKey: input.openRouterApiKey,
				baseURL: input.openRouterBaseURL,
				appURL: input.appURL
			}),
			observer: operationObserver,
			workflow: workflowObserver,
			inlineAdmission: createInlineAdmission()
		}),
		reranker,
		queryGenerator,
		queryRules: new SearchQueryRules(),
		queryObserver: input.queryObserver ?? operationObserver,
		embeddingBatching,
		attachmentIndexer: index,
		noteIndexer: index,
		diagramIndexer: index,
		memoryIndexer: index,
		widgetIndexer: index,
		lookup: new KnowledgeLookup(repository),
		maintenance: new EmbeddingMaintenance(
			new IndexBacklog(repository),
			embeddingClient,
			embeddingBatching,
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
