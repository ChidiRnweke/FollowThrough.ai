import type { KnowledgeSearchSource } from '$lib/models/knowledge-search';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { EmbeddingClient, Reranker } from '$lib/server/services/knowledge-search/contracts';
import {
	queryVector,
	knowledgeSearchSource,
	searchCandidateLimit,
	type KnowledgeLookup
} from '$lib/server/services/knowledge-search/semantic';
import {
	searchQueryInput,
	type ISearchQueryGeneration
} from '$lib/server/services/knowledge-search/query-generation';
import type { ConversationJournal } from '$lib/server/services/agent/runs/contracts';
import type { DateTime } from '$lib/models/workspace';

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
}

export interface RetrievalDependencies {
	knowledgeLookup: Pick<KnowledgeLookup, 'search'>;
	embeddings: EmbeddingClient;
	reranker: Reranker;
	queryGenerator: ISearchQueryGeneration;
	conversations: Pick<ConversationJournal, 'listMessages'>;
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
			queryVector(batch),
			searchCandidateLimit(limit),
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
			source: knowledgeSearchSource(match.document),
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
		const query = searchQueryInput(input.query, history);
		return query.kind === 'direct'
			? query.query
			: this.dependencies.queryGenerator.generate(query.transcript);
	}
}
