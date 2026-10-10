import { ExternalServiceError } from '$lib/errors';
import type { SearchQueryCache } from '$lib/models/knowledge-search/query-generation';
import type { OperationObserver } from '$lib/models/telemetry';
import type { ISearchQueryRules } from '$lib/server/services/knowledge-search/query-rules';
import type { ConversationId } from '$lib/models/agent';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ActorContext } from '$lib/models/identity';
import type { KnowledgeSearchSource } from '$lib/models/knowledge-search';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import type { ConversationMessages } from '$lib/server/services/agent/conversations/archive';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { Reranker } from '$lib/models/knowledge-search';
import type { EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import type { SearchQueryGenerator } from '$lib/models/knowledge-search/query-generation';
import type { IKnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

export interface SearchKnowledgeInput {
	readonly query: string;
	readonly conversationId?: ConversationId;
	readonly limit?: number;
	/** When set, restricts results to notes and facts in this project. */
	readonly projectId?: ProjectId;
	/** When set, restricts results to chunks of this note (diagrams included). */
	readonly noteId?: NoteId;
	readonly createdAfter?: DateTime;
	readonly createdBefore?: DateTime;
}

export interface KnowledgeSearchResult {
	readonly source: KnowledgeSearchSource;
	readonly noteId?: NoteId;
	readonly content: string;
	readonly score: number;
	readonly sourceCreatedAt?: DateTime;
}

/**
 * Application boundary for semantic knowledge search across the user's notes and facts,
 * optionally scoped to a project and a time window.
 */
export interface RetrievalController {
	search(
		actor: ActorContext,
		input: SearchKnowledgeInput
	): Promise<readonly KnowledgeSearchResult[]>;

	agentSearch(actor: ActorContext, input: AgentToolInput<'search'>): Promise<AgentPayload>;
	agentSearchNote(actor: ActorContext, input: AgentToolInput<'search_note'>): Promise<AgentPayload>;
}

export interface RetrievalDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	knowledgeLookup: IKnowledgeLookup;
	embeddings: EmbeddingClient;
	reranker: Reranker;
	queryGenerator: SearchQueryGenerator;
	queryRules: ISearchQueryRules;
	queryCache?: SearchQueryCache;
	observer: OperationObserver;
	conversations: Pick<ConversationMessages, 'listMessages'>;
}

const DEFAULT_SEARCH_LIMIT = 8;

export class Retrieval implements RetrievalController {
	constructor(private readonly dependencies: RetrievalDependencies) {}

	async search(
		actor: ActorContext,
		input: SearchKnowledgeInput
	): Promise<readonly KnowledgeSearchResult[]> {
		const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
		const query = await this.resolveQuery(actor, input);
		if (!query.trim()) return [];
		const batch = await this.dependencies.embeddings.embed([query]);
		const candidates = await this.dependencies.knowledgeLookup.search(
			actor,
			batch,
			this.dependencies.knowledgeLookup.candidateLimit(limit),
			input.projectId,
			{
				createdAfter: input.createdAfter,
				createdBefore: input.createdBefore,
				noteId: input.noteId
			}
		);
		// ADR 0036 retains retrieved knowledge when only reranking is unavailable.
		let matches = candidates;
		if (candidates.length > 1) {
			const ranking = await this.dependencies.reranker
				.rerank(query, candidates, limit)
				.then((matches) => ({ kind: 'ranked' as const, matches }))
				.catch((error): { kind: 'failure'; error: Error } => {
					return {
						kind: 'failure',
						error: error instanceof Error ? error : new Error(String(error))
					};
				});
			matches = ranking.kind === 'ranked' ? ranking.matches : candidates.slice(0, limit);
		}
		return matches.map((match) => ({
			source: this.dependencies.knowledgeLookup.source(match.document),
			noteId: match.document.noteId,
			content: match.document.content,
			score: match.score,
			sourceCreatedAt: match.document.sourceCreatedAt
		}));
	}

	/**
	 * Multi-turn: generate the whole conversation (+ the model's query) into one
	 * statement to embed. Single-turn / no history: use the query directly.
	 */
	private async resolveQuery(actor: ActorContext, input: SearchKnowledgeInput): Promise<string> {
		if (!input.conversationId) return input.query;
		const history = await this.dependencies.conversations.listMessages(actor, input.conversationId);
		const query = this.dependencies.knowledgeLookup.queryInput(input.query, history);
		if (query.kind === 'direct') return query.query;
		const cached = await this.dependencies.queryCache?.read(query.transcript);
		if (cached?.kind === 'hit') return cached.query;
		const generated = await this.generateQuery(query.transcript);
		await this.dependencies.queryCache?.write(query.transcript, generated);
		return generated;
	}

	private async generateQuery(text: string): Promise<string> {
		const { queryGenerator, queryRules, observer } = this.dependencies;
		try {
			return await observer.run(
				'knowledge_search.generate_query',
				{ input: text, metadata: { model: queryGenerator.model } },
				async () => queryRules.complete(await queryGenerator.generate(queryRules.prepare(text))),
				(result) => result
			);
		} catch (error) {
			throw new ExternalServiceError('Search query generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async agentSearch(actor: ActorContext, input: AgentToolInput<'search'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.search(actor, {
				query: input.query,
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
				...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
				...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentSearchNote(
		actor: ActorContext,
		input: AgentToolInput<'search_note'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.search(actor, {
				query: input.query,
				noteId: input.noteId as NoteId,
				...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
				...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
