import type { ActorContext, Conversation, ConversationId, Message } from '../models';
export interface ConversationRepository {
	list(actor: ActorContext, kind?: Conversation['kind']): Promise<readonly Conversation[]>;
	findById(actor: ActorContext, id: ConversationId): Promise<Conversation | undefined>;
	insert(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	update(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	appendMessage(actor: ActorContext, message: Message): Promise<Message>;
	listMessages(actor: ActorContext, id: ConversationId): Promise<readonly Message[]>;
}
