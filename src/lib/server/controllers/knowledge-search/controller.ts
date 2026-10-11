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
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
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

	knowledge: KnowledgeSearch;
	conversations: Pick<ConversationMessages, 'listMessages'>;
}

const DEFAULT_SEARCH_LIMIT = 8;

export class Retrieval implements RetrievalController {
	constructor(private readonly dependencies: RetrievalDependencies) {}

	async search(
		actor: ActorContext,
		input: SearchKnowledgeInput
	): Promise<readonly KnowledgeSearchResult[]> {
		const query = input.conversationId
			? await this.dependencies.knowledge.searchQuery(
					input.query,
					await this.dependencies.conversations.listMessages(actor, input.conversationId)
				)
			: input.query;
		if (!query.trim()) return [];
		const matches = await this.dependencies.knowledge.retrieve(actor, query, {
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
