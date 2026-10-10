import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import type { IInlineSuggestionCompletion } from '$lib/server/services/inline-suggestions/inline-completion';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import type { TokenCodec } from '$lib/models/tokenization';
import {
	InlineContextService,
	type IInlineContextService
} from '$lib/server/services/inline-suggestions/inline-context';
import { Cl100kTokenizer } from '$lib/server/adapters/tokenization/cl100k';
import type {
	AttachmentIndexing,
	DiagramIndexing,
	IndexCompletion,
	MemoryIndexing,
	NoteIndexing,
	WidgetIndexing
} from '$lib/server/services/knowledge-search/indexing';
import { createContentIndex } from '$lib/server/factories/content-index';
import type { ScheduledTask } from '$lib/models/maintenance';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import type { InlineSuggestionThrottle } from '$lib/models/agent';
import { normalizeLanguageModelId } from '$lib/models/agent';
import { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import type { Database } from '$lib/server/db';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';

import { SearchRanking } from '$lib/server/services/knowledge-search/ranking';
import {
	KnowledgeLookup,
	type IKnowledgeLookup
} from '$lib/server/services/knowledge-search/semantic';
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
