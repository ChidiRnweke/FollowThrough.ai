import type { ConversationId } from '$lib/models/agent';
import { Registry } from '$lib/stores/notes/registries/registry';
import {
	ChatStore,
	mintChatSessionKey,
	rememberConversation,
	type ChatSessionKey
} from '../chat.svelte';

/**
 * Per-session registry of `ChatStore` instances.
 *
 * `ChatStore` used to be a module singleton, which capped the app at one live
 * conversation: the docked panel and `/chats/[id]` imported the same instance
 * and fought over its transcript. The server has never had that limit — the
 * `agent_runs_active_conversation_unique` index is scoped per conversation, not
 * per user — so the ceiling was purely client-side.
 *
 * Lifetime follows the same refcount idiom the note panes use: whoever mounts a
 * session calls `for` and releases on destroy. Releasing detaches the session's
 * EventSource, because a stream must not outlive the surface showing it.
 */
const registry = new Registry<ChatSessionKey, ChatStore>(
	(key) => new ChatStore(key),
	(_key, store) => store.detach()
);

/**
 * How many sessions may stream at once.
 *
 * Not a product limit — a transport one. Over HTTP/1.1 (which the dev server
 * speaks) browsers cap concurrent connections to an origin at around six, and
 * an exhausted pool shows up as a run that silently never streams rather than
 * as an error. Four leaves room for the app's other requests.
 */
export const MAX_CONCURRENT_STREAMS = 4;

export class ChatRegistry {
	/** A fresh session, with no conversation behind it until its first send. */
	mint(): ChatSessionKey {
		return mintChatSessionKey();
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
		for (const key of registry.heldKeys())
			if (registry.peek(key)?.conversationId === conversationId) return key;
		return undefined;
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
		rememberConversation(key, conversationId);
		return key;
	}

	/** The open session showing `conversationId`, for callers that need the store. */
	sessionForConversation(conversationId: ConversationId): ChatStore | undefined {
		const key = this.keyForConversation(conversationId);
		return key === undefined ? undefined : registry.peek(key);
	}

	/** Sessions currently mid-run, across every mounted surface. */
	streamingCount(): number {
		let count = 0;
		for (const key of registry.heldKeys()) if (registry.peek(key)?.isStreaming) count += 1;
		return count;
	}

	/** True when another run would exceed the connection budget above. */
	atStreamLimit(): boolean {
		return this.streamingCount() >= MAX_CONCURRENT_STREAMS;
	}

	for(key: ChatSessionKey): ChatStore {
		return registry.for(key);
	}

	/**
	 * The store for a key its caller holds for the app's lifetime, acquiring it
	 * once. Idempotent, so it is safe to call from a `$derived` that re-runs —
	 * unlike `for`, which would bump the refcount on every read.
	 */
	resident(key: ChatSessionKey): ChatStore {
		return registry.peek(key) ?? registry.for(key);
	}

	release(key: ChatSessionKey): void {
		registry.release(key);
	}

	peek(key: ChatSessionKey): ChatStore | undefined {
		return registry.peek(key);
	}

	isHeld(key: ChatSessionKey): boolean {
		return registry.isHeld(key);
	}
}

export const chatRegistry = new ChatRegistry();
