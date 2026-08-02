import type { Database } from '$lib/server/db';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';
import { KnowledgeIndexMaintenance } from '$lib/server/services/knowledge-search/index-maintenance';
import {
	EmbeddedAttachmentIndexer,
	EmbeddedDiagramIndexer,
	EmbeddedMemoryIndexer,
	EmbeddedNoteIndexer,
	retrievalChunkerFromEnv
} from '$lib/server/services/knowledge-search/indexing';
import { SearchRanking } from '$lib/server/services/knowledge-search/ranking';
import {
	EmbeddedKnowledgeSearcher,
	ProjectScopedLinkFinder,
	RerankingKnowledgeSearcher,
	type Reranker
} from '$lib/server/services/knowledge-search/semantic';
import type { Condenser, EmbeddingClient } from '$lib/server/services/knowledge-search/contracts';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import { operationObserver } from '$lib/server/services/telemetry';
import { optionalProperty, positiveNumberFromEnvironment } from '$lib/server/config';
import { ConversationSummary } from '$lib/server/services/agent/conversations/summary';
import {
	EmbeddedToolRetriever,
	type ToolRetriever
} from '$lib/server/services/agent/tools/tool-retriever';
import type { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { InlineSuggestionAdmission } from '$lib/server/services/inline-suggestions/inline-admission';
import { InlineSuggestionCompletion } from '$lib/server/services/inline-suggestions/inline-completion';
import { InlineSuggestionContext } from '$lib/server/services/inline-suggestions/inline-context';
import type { MemoryLibrary } from '$lib/server/services/memory/library';

export interface KnowledgeSearchCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly notes: NoteCatalog;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly embeddingClient?: EmbeddingClient;
	readonly reranker?: Reranker;
	readonly condenser?: Condenser;
	readonly deferEmbedding: boolean;
}

export interface KnowledgeSearchCapability {
	readonly repository: KnowledgeIndexRecords;
	readonly embeddingClient: EmbeddingClient;
	readonly reranker: Reranker;
	readonly condenser: Condenser;
	readonly attachmentIndexer: EmbeddedAttachmentIndexer;
	readonly noteIndexer: EmbeddedNoteIndexer;
	readonly diagramIndexer: EmbeddedDiagramIndexer;
	readonly memoryIndexer: EmbeddedMemoryIndexer;
	readonly embeddedSearcher: EmbeddedKnowledgeSearcher;
	readonly searcher: RerankingKnowledgeSearcher;
	readonly linkFinder: ProjectScopedLinkFinder;
	readonly maintenance: KnowledgeIndexMaintenance;
	readonly toolRetriever: ToolRetriever;
	readonly finalize: (input: KnowledgeSearchFinalizeInput) => KnowledgeSearchFinalized;
}

export interface KnowledgeSearchFinalizeInput {
	readonly preferences: AgentPreferenceCatalog;
	readonly memory: MemoryLibrary;
}

export interface KnowledgeSearchFinalized {
	readonly preferences: AgentPreferenceCatalog;
	readonly inlineCompletion: InlineSuggestionCompletion;
	readonly inlineContext: InlineSuggestionContext;
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
	const embeddedSearcher = new EmbeddedKnowledgeSearcher(repository, embeddingClient);
	const condenser =
		input.condenser ??
		new ConversationSummary(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		});
	return {
		repository,
		embeddingClient,
		toolRetriever: new EmbeddedToolRetriever(embeddingClient),
		finalize: ({ preferences, memory }) => ({
			preferences,
			inlineCompletion: new InlineSuggestionCompletion(input.openRouterApiKey, {
				baseURL: input.openRouterBaseURL,
				appURL: input.appURL,
				observer: operationObserver
			}),
			inlineContext: new InlineSuggestionContext({
				searcher: embeddedSearcher,
				memory,
				reranker,
				observer: operationObserver
			}),
			inlineAdmission: new InlineSuggestionAdmission()
		}),
		reranker,
		condenser,
		attachmentIndexer: new EmbeddedAttachmentIndexer(repository, embeddingClient, chunker),
		noteIndexer: new EmbeddedNoteIndexer(
			repository,
			embeddingClient,
			chunker,
			input.deferEmbedding
		),
		diagramIndexer: new EmbeddedDiagramIndexer(
			repository,
			embeddingClient,
			input.notes,
			chunker,
			input.deferEmbedding
		),
		memoryIndexer: new EmbeddedMemoryIndexer(
			repository,
			embeddingClient,
			chunker,
			input.deferEmbedding
		),
		embeddedSearcher,
		searcher: new RerankingKnowledgeSearcher(embeddedSearcher, reranker),
		linkFinder: new ProjectScopedLinkFinder(
			input.notes,
			new RerankingKnowledgeSearcher(embeddedSearcher, reranker),
			new RelationshipDiscovery({ observer: operationObserver })
		),
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
