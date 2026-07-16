import type { ActorContext, Conversation, ConversationId, Message } from '../models';
export interface ConversationListOptions {
	readonly kind?: Conversation['kind'];
	readonly limit?: number;
	readonly offset?: number;
	readonly query?: string;
}
export interface ConversationRepository {
	list(actor: ActorContext, options?: ConversationListOptions): Promise<readonly Conversation[]>;
	findById(actor: ActorContext, id: ConversationId): Promise<Conversation | undefined>;
	insert(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	update(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	delete(actor: ActorContext, id: ConversationId): Promise<void>;
	appendMessage(actor: ActorContext, message: Message): Promise<Message>;
	listMessages(actor: ActorContext, id: ConversationId): Promise<readonly Message[]>;
}
