import type { OperationObserver, WorkflowObserver } from '$lib/models/telemetry';
import type { InlineCompletionGenerator } from '$lib/models/agent';
import {
	InlineCompletionRules,
	type IInlineCompletionRules
} from '$lib/server/services/inline-suggestions/completion-rules';
import { normalizeLanguageModelId } from '$lib/models/agent';
import type { ScheduledTask } from '$lib/models/maintenance';
import type { TokenCodec } from '$lib/models/tokenization';
import { Cl100kTokenizer } from '$lib/server/infrastructure/tokenization/cl100k';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import {
	ToolDiscovery,
	type ToolDiscoveryController
} from '$lib/server/controllers/tool-discovery/controller';
import type { Database } from '$lib/server/db';
import { createRetrievalProvider } from '$lib/server/factories/retrieval-providers';
import {
	KnowledgeRetrieval,
	type KnowledgeRetrievalCapabilities
} from '$lib/server/services/knowledge-search/retrieval';
import {
	ToolSearch,
	type ToolRanking,
	type ToolSeeding
} from '$lib/server/services/agent/tools/tool-search';
import { DEFAULT_EMBEDDING_MODEL } from '$lib/models/knowledge-search/embeddings';
import { DEFAULT_SEARCH_QUERY_MODEL } from '$lib/models/knowledge-search/query-generation';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import {
	InlineContextService,
	type IInlineContextService
} from '$lib/server/services/inline-suggestions/inline-context';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';

import { optionalProperty, positiveNumberFromEnvironment } from '$lib/server/config';
import {
	InlineAdmissionRules,
	type IInlineAdmissionRules
} from '$lib/server/services/inline-suggestions/inline-admission';
import {
	InlineAdmissionStore,
	type InlineAdmissionState
} from '$lib/server/stores/inline-suggestions/admission';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { AgentPreferenceEditor } from '$lib/server/services/agent/runs/preferences';
import { createInlineCompletion } from '$lib/server/factories/inline-completion';
import { operationObserver, workflowObserver } from '$lib/server/infrastructure/telemetry/tracing';

export interface KnowledgeSearchCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly knowledge?: KnowledgeRetrievalCapabilities;
	readonly toolSearch?: ToolSeeding & ToolRanking;
	readonly deferEmbedding: boolean;
}

export interface KnowledgeSearchCapability {
	readonly tokenizer: TokenCodec;
	/** Indexing, backfill and search over knowledge: one capability behind its interfaces. */
	readonly knowledge: KnowledgeRetrievalCapabilities;
	readonly maintenance: ScheduledTask;
	readonly toolRetriever: ToolDiscoveryController;
	readonly toolDiscovery: ToolRanking;
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
	readonly admissionRules: IInlineAdmissionRules;
	readonly admissions: InlineAdmissionState;
}

export const createKnowledgeSearchCapability = (
	input: KnowledgeSearchCapabilityInput
): KnowledgeSearchCapability => {
	const tokenizer = new Cl100kTokenizer();
	const provider = createRetrievalProvider({
		apiKey: input.openRouterApiKey,
		baseURL: input.openRouterBaseURL,
		appURL: input.appURL
	});
	const knowledge =
		input.knowledge ??
		new KnowledgeRetrieval({
			repository: new KnowledgeIndexRecords(input.db),
			provider: provider.client,
			rerank: provider.rerank,
			models: { embedding: DEFAULT_EMBEDDING_MODEL, query: DEFAULT_SEARCH_QUERY_MODEL },
			encoding: tokenizer,
			chunking: {
				targetTokens: Number(process.env.RETRIEVAL_CHUNK_TOKENS ?? 2400),
				overlapTokens: Number(process.env.RETRIEVAL_CHUNK_OVERLAP_TOKENS ?? 480)
			},
			defer: input.deferEmbedding,
			observer: operationObserver
		});
	const toolSearch =
		input.toolSearch ??
		new ToolSearch({
			repository: new ToolEmbeddingRecords(input.db),
			provider: provider.client,
			model: DEFAULT_EMBEDDING_MODEL,
			tokens: tokenizer,
			observer: operationObserver
		});

	return {
		tokenizer,
		knowledge,
		toolRetriever: new ToolDiscovery(
			toolSearch,
			input.transactionRunner,
			new AgentToolCatalogService()
		),
		toolDiscovery: toolSearch,
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
			admissionRules: new InlineAdmissionRules(),
			admissions: new InlineAdmissionStore()
		}),
		maintenance: new EmbeddingMaintenance(
			knowledge,
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
