import type { ActorContext, Conversation, ConversationId, Message, MessageId } from '../models';
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
	/**
	 * Drop the named messages. Used when a question is edited or asked again: the
	 * discarded turn has to leave the transcript, or hydration puts it back on the
	 * next page load. Named rather than cut at a timestamp because messages
	 * recorded in the same millisecond are indistinguishable by `createdAt`.
	 */
	deleteMessages(
		actor: ActorContext,
		id: ConversationId,
		messageIds: readonly MessageId[]
	): Promise<void>;
}
