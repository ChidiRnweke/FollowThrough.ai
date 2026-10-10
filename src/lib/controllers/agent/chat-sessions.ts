import { MAX_CONCURRENT_STREAMS } from '$lib/models/chat';
import type { ConversationId } from '$lib/models/agent';
import { type ChatSessionKey } from '$lib/models/chat';
import type { ChatSessionController } from './chat-session';
import type { ChatSessionsState } from '$lib/stores/agent/chat-sessions';
export interface ChatSessionFactory {
	create(key: ChatSessionKey): ChatSessionController;
	remember(key: ChatSessionKey, id: ConversationId): void;
}
export interface ChatSessionsController {
	mint(): ChatSessionKey;
	keyForConversation(id: ConversationId): ChatSessionKey | undefined;
	sessionKeyFor(id: ConversationId): ChatSessionKey;
	sessionForConversation(id: ConversationId): ChatSessionController | undefined;
	streamingCount(): number;
	atStreamLimit(): boolean;
	for(key: ChatSessionKey): ChatSessionController;
	resident(key: ChatSessionKey): ChatSessionController;
	release(key: ChatSessionKey): void;
	peek(key: ChatSessionKey): ChatSessionController | undefined;
	isHeld(key: ChatSessionKey): boolean;
	stop(): void;
}

export class ChatSessions implements ChatSessionsController {
	constructor(
		private readonly state: ChatSessionsState,
		private readonly factory: ChatSessionFactory
	) {}
	/** A fresh session, with no conversation behind it until its first send. */
	mint(): ChatSessionKey {
		return crypto.randomUUID();
	}

	/**
	 * The session showing `conversationId`, if one is already open.
	 *
	 * Opening the same conversation twice must return the session that already
	 * holds it rather than a second store against it: two stores would each
	 * submit runs to one conversation, and the server's active-run uniqueness
	 * index would reject whichever arrived second.
	 */
	keyForConversation(conversationId: ConversationId): ChatSessionKey | undefined {
		for (const key of this.state.sessions.keys())
			if (this.state.sessions.get(key)?.session?.conversationId === conversationId) return key;
		const pending = this.state.conversations.get(conversationId);
		if (pending === undefined) return undefined;
		const session = this.state.sessions.get(pending)?.session;
		if (session?.initialized) {
			this.state.conversations.delete(conversationId);
			return undefined;
		}
		return pending;
	}

	/**
	 * The session showing `conversationId`, opening one bound to it if none is.
	 *
	 * What a caller wants when it is about to put that conversation on screen —
	 * a reopened studio, say — where `keyForConversation` alone would answer
	 * `undefined` and leave it to mint a key that shows an empty chat.
	 */
	sessionKeyFor(conversationId: ConversationId): ChatSessionKey {
		const existing = this.keyForConversation(conversationId);
		if (existing !== undefined) return existing;
		const key = this.mint();
		this.factory.remember(key, conversationId);
		this.state.conversations.set(conversationId, key);
		return key;
	}

	/** The open session showing `conversationId`, for callers that need the store. */
	sessionForConversation(conversationId: ConversationId): ChatSessionController | undefined {
		const key = this.keyForConversation(conversationId);
		return key === undefined ? undefined : this.state.sessions.get(key)?.session;
	}

	/** Sessions currently mid-run, across every mounted surface. */
	streamingCount(): number {
		let count = 0;
		for (const key of this.state.sessions.keys())
			if (this.state.sessions.get(key)?.session?.isStreaming) count += 1;
		return count;
	}

	/** True when another run would exceed the connection budget above. */
	atStreamLimit(): boolean {
		return this.streamingCount() >= MAX_CONCURRENT_STREAMS;
	}

	for(key: ChatSessionKey): ChatSessionController {
		const entry = this.state.sessions.get(key);
		if (entry) {
			entry.references++;
			return entry.session;
		}
		const session = this.factory.create(key);
		this.state.sessions.set(key, { session, references: 1 });
		return session;
	}

	/**
	 * The store for a key its caller holds for the app's lifetime, acquiring it
	 * once. Idempotent, so it is safe to call from a `$derived` that re-runs —
	 * unlike `for`, which would bump the refcount on every read.
	 */
	resident(key: ChatSessionKey): ChatSessionController {
		return this.state.sessions.get(key)?.session ?? this.for(key);
	}

	release(key: ChatSessionKey): void {
		const entry = this.state.sessions.get(key);
		if (!entry) return;
		entry.references--;
		if (entry.references > 0) return;
		entry.session.release();
		this.state.sessions.delete(key);
		for (const [id, known] of this.state.conversations)
			if (known === key) this.state.conversations.delete(id);
	}

	peek(key: ChatSessionKey): ChatSessionController | undefined {
		return this.state.sessions.get(key)?.session;
	}

	stop(): void {
		for (const { session } of this.state.sessions.values()) session.release();
		this.state.sessions.clear();
		this.state.conversations.clear();
	}
	isHeld(key: ChatSessionKey): boolean {
		return this.state.sessions.has(key);
	}
}
