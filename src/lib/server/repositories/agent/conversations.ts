import type {
	Conversation,
	ConversationId,
	Message,
	MessageId,
	StoredMessage
} from '$lib/models/agent';
export interface ConversationListOptions {
	readonly kind?: Conversation['kind'];
	readonly limit?: number;
	readonly offset?: number;
	readonly query?: string;
}
/** A conversation's context (project or note) is fixed on creation; nothing here ever changes it after the first turn. */
export interface ConversationRepository {
	list(options?: ConversationListOptions): Promise<readonly Conversation[]>;
	findForWrite(id: ConversationId): Promise<Conversation | undefined>;
	findById(id: ConversationId): Promise<Conversation | undefined>;
	insert(conversation: Conversation): Promise<Conversation>;
	update(conversation: Conversation): Promise<Conversation>;
	delete(id: ConversationId): Promise<void>;
	appendMessage(message: Message): Promise<Message>;
	listMessages(id: ConversationId): Promise<readonly StoredMessage[]>;
	/**
	 * Drop the named messages. Used when a question is edited or asked again: the
	 * discarded turn has to leave the transcript, or hydration puts it back on the
	 * next page load. Named rather than cut at a timestamp because messages
	 * recorded in the same millisecond are indistinguishable by `createdAt`.
	 */
	deleteMessages(id: ConversationId, messageIds: readonly MessageId[]): Promise<void>;
}
