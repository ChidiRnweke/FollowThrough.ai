import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, Message } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Condenser, KnowledgeSearcher } from '$lib/server/services/knowledge-search/contracts';
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
	knowledgeSearcher: KnowledgeSearcher;
	condenser: Condenser;
	conversations: ConversationJournal;
}

const DEFAULT_SEARCH_LIMIT = 8;

const messageText = (message: Message): string => {
	const content = message.content;
	if (typeof content.text === 'string') return content.text;
	if (typeof content.content === 'string') return content.content;
	return JSON.stringify(content);
};

export class Retrieval implements RetrievalController {
	constructor(private readonly dependencies: RetrievalDependencies) {}

	async search(
		actor: ActorContext,
		input: SearchKnowledgeInput
	): Promise<readonly KnowledgeSearchResult[]> {
		const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
		const query = await this.resolveQuery(actor, input);
		const matches = await this.dependencies.knowledgeSearcher.search(
			actor,
			query,
			limit,
			input.projectId,
			undefined,
			{
				createdAfter: input.createdAfter,
				createdBefore: input.createdBefore,
				noteId: input.noteId
			}
		);
		return matches.map((match) => ({
			noteId: match.document.noteId,
			content: match.document.content,
			score: match.score,
			sourceCreatedAt: match.document.sourceCreatedAt
		}));
	}

	/**
	 * Multi-turn: condense the whole conversation (+ the model's query) into one
	 * statement to embed. Single-turn / no history: use the query directly.
	 */
	private async resolveQuery(actor: ActorContext, input: SearchKnowledgeInput): Promise<string> {
		if (!input.conversationId) return input.query;
		const history = await this.dependencies.conversations.listMessages(actor, input.conversationId);
		if (history.length <= 1) return input.query;
		const transcript = [...history.map(messageText), `user: ${input.query}`].join('\n');
		return this.dependencies.condenser.condense(transcript);
	}
}
