import type { ActorContext, Conversation, ConversationId, Message } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { ConversationRepository } from '$lib/repositories';

export class InMemoryConversationRepository implements ConversationRepository {
	conversations: Conversation[] = [];
	messages: Message[] = [];

	async list(actor: ActorContext, kind?: Conversation['kind']): Promise<readonly Conversation[]> {
		return this.conversations
			.filter(
				(conversation) =>
					conversation.userId === actor.userId && (kind === undefined || conversation.kind === kind)
			)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

	async appendMessage(actor: ActorContext, message: Message): Promise<Message> {
		if (!(await this.findById(actor, message.conversationId)))
			throw new NotFoundError('Conversation was not found');
		this.messages.push(message);
		return message;
	}

	async listMessages(actor: ActorContext, id: ConversationId): Promise<readonly Message[]> {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Conversation was not found');
		return this.messages.filter((message) => message.conversationId === id);
	}
}
