import type { ActorContext, ConversationId, Message, NoteId, ProjectId } from '$lib/models';
import type { Condenser, ConversationJournal, KnowledgeSearcher } from '$lib/services';

export interface SearchKnowledgeInput {
	readonly query: string;
	readonly conversationId?: ConversationId;
	readonly limit?: number;
	/** When set, restricts results to notes and facts in this project. */
	readonly projectId?: ProjectId;
}

export interface KnowledgeSearchResult {
	readonly noteId?: NoteId;
	readonly content: string;
	readonly score: number;
}

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

const CONTENT_EXCERPT_LIMIT = 700;
const DEFAULT_SEARCH_LIMIT = 8;

const messageText = (message: Message): string => {
	const content = message.content;
	if (typeof content.text === 'string') return content.text;
	if (typeof content.content === 'string') return content.content;
	return JSON.stringify(content);
};

export class DefaultRetrievalController implements RetrievalController {
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
			input.projectId
		);
		return matches.map((match) => ({
			noteId: match.document.noteId,
			content: match.document.content.slice(0, CONTENT_EXCERPT_LIMIT),
			score: match.score
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
