import type { ConversationId } from '$lib/models/agent';
import type { KnowledgeSearchSource } from '$lib/models/knowledge-search';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import type { ConversationMessages } from '$lib/server/services/agent/conversations/archive';
import type { KnowledgeSearch } from '$lib/server/services/knowledge-search/retrieval';

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
	search(input: SearchKnowledgeInput): Promise<readonly KnowledgeSearchResult[]>;
}

export interface RetrievalDependencies {
	knowledge: KnowledgeSearch;
	conversations: Pick<ConversationMessages, 'listMessages'>;
}

const DEFAULT_SEARCH_LIMIT = 8;

export class Retrieval implements RetrievalController {
	constructor(private readonly dependencies: RetrievalDependencies) {}

	async search(input: SearchKnowledgeInput): Promise<readonly KnowledgeSearchResult[]> {
		const query = input.conversationId
			? await this.dependencies.knowledge.searchQuery(
					input.query,
					await this.dependencies.conversations.listMessages(input.conversationId)
				)
			: input.query;
		if (!query.trim()) return [];
		const matches = await this.dependencies.knowledge.retrieve(query, {
			limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
			projectId: input.projectId,
			filter: {
				createdAfter: input.createdAfter,
				createdBefore: input.createdBefore,
				noteId: input.noteId
			}
		});
		return matches.map((match) => ({
			source: this.dependencies.knowledge.source(match.document),
			noteId: match.document.noteId,
			content: match.document.content,
			score: match.score,
			sourceCreatedAt: match.document.sourceCreatedAt
		}));
	}
}
