import type { ActorContext, Conversation, ConversationId, Message } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { ConversationListOptions, ConversationRepository } from '$lib/repositories';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryConversationRepository implements ConversationRepository, SnapshotParticipant {
	conversations: Conversation[] = [];
	messages: Message[] = [];

	constructor(private readonly runExists?: (runId: string) => boolean) {}

	async list(
		actor: ActorContext,
		options: ConversationListOptions = {}
	): Promise<readonly Conversation[]> {
		const listed = this.conversations
			.filter(
				(conversation) =>
					conversation.userId === actor.userId &&
					(options.kind === undefined || conversation.kind === options.kind) &&
					(!options.query ||
						conversation.title?.toLowerCase().includes(options.query.toLowerCase()))
			)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
		return listed.slice(
			options.offset ?? 0,
			(options.offset ?? 0) + (options.limit ?? listed.length)
		);
	}

	async findById(actor: ActorContext, id: ConversationId): Promise<Conversation | undefined> {
		return this.conversations.find(
			(conversation) => conversation.id === id && conversation.userId === actor.userId
		);
	}

	async insert(actor: ActorContext, conversation: Conversation): Promise<Conversation> {
		const owned = { ...conversation, userId: actor.userId };
		this.conversations.push(owned);
		return owned;
	}

	async update(actor: ActorContext, conversation: Conversation): Promise<Conversation> {
		if (!(await this.findById(actor, conversation.id)))
			throw new NotFoundError('Conversation was not found');
		this.conversations = this.conversations.map((item) =>
			item.id === conversation.id ? conversation : item
		);
		return conversation;
	}

	async delete(actor: ActorContext, id: ConversationId): Promise<void> {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Conversation was not found');
		this.conversations = this.conversations.filter((conversation) => conversation.id !== id);
		this.messages = this.messages.filter((message) => message.conversationId !== id);
	}

	async appendMessage(actor: ActorContext, message: Message): Promise<Message> {
		if (!(await this.findById(actor, message.conversationId)))
			throw new NotFoundError('Conversation was not found');
		if (message.runId && this.runExists && !this.runExists(message.runId))
			throw new NotFoundError(`Agent run ${message.runId} was not found`);
		this.messages.push(message);
		return message;
	}

	async listMessages(actor: ActorContext, id: ConversationId): Promise<readonly Message[]> {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Conversation was not found');
		return this.messages.filter((message) => message.conversationId === id);
	}

	async deleteMessages(
		actor: ActorContext,
		id: ConversationId,
		messageIds: readonly Message['id'][]
	): Promise<void> {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Conversation was not found');
		this.messages = this.messages.filter(
			(message) => message.conversationId !== id || !messageIds.includes(message.id)
		);
	}

	snapshot(): unknown {
		return structuredClone({ conversations: this.conversations, messages: this.messages });
	}

	restore(snapshot: unknown): void {
		const state = snapshot as {
			conversations: Conversation[];
			messages: Message[];
		};
		this.conversations = state.conversations;
		this.messages = state.messages;
	}
}
