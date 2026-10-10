import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import { ChatSessions } from '$lib/controllers/agent/chat-sessions';
import { ChatSessionsState } from '$lib/stores/agent/chat-sessions';
import { createChatFixture } from '$lib/testing/agent/chat-session';
import { InMemoryRunTransport } from '$lib/testing/agent/fakes/in-memory-run-transport';
import { rememberChatConversation } from '$lib/client/agent/chat-choices-storage';
import type { ChatSessionState } from '$lib/stores/agent/chat-session.svelte';
import type { AgentRunId } from '$lib/models/agent';

const conversationId = '20000000-0000-4000-8000-000000000001' as ConversationId;
const otherConversationId = '20000000-0000-4000-8000-000000000002' as ConversationId;

/**
 * The registry's module-level map is shared, so each test takes its own keys and
 * releases them; `ChatRegistry` is a thin facade over that one map.
 */
const states = new Map<string, ChatSessionState>();
const registry = new ChatSessions(new ChatSessionsState(), {
	create: (key) => {
		const fixture = createChatFixture(
			key,
			new InMemoryRunTransport({
				runId: '10000000-0000-4000-8000-000000000001' as AgentRunId,
				conversationId,
				status: 'queued',
				latestCursor: '0'
			})
		);
		states.set(key, fixture.state);
		return fixture.chat;
	},
	remember: rememberChatConversation
});

describe('chat session registry', () => {
	it('gives two keys two different stores', () => {
		const first = registry.mint();
		const second = registry.mint();
		try {
			expect(registry.for(first)).not.toBe(registry.for(second));
		} finally {
			registry.release(first);
			registry.release(second);
		}
	});

	it('gives one key the same store on every acquire', () => {
		const key = registry.mint();
		try {
			expect(registry.for(key)).toBe(registry.for(key));
		} finally {
			registry.release(key);
			registry.release(key);
		}
	});

	it('carries the session key onto the store it creates', () => {
		const key = registry.mint();
		try {
			expect(registry.for(key).sessionKey).toBe(key);
		} finally {
			registry.release(key);
		}
	});

	it('finds the open session showing a conversation', () => {
		const key = registry.mint();
		registry.for(key);
		states.get(key)!.conversationId = conversationId;
		try {
			expect(registry.keyForConversation(conversationId)).toBe(key);
		} finally {
			registry.release(key);
		}
	});

	it('reports no session for a conversation nothing has open', () => {
		const key = registry.mint();
		registry.for(key);
		states.get(key)!.conversationId = conversationId;
		try {
			expect(registry.keyForConversation(otherConversationId)).toBeUndefined();
		} finally {
			registry.release(key);
		}
	});

	it('forgets a conversation once its session is released', () => {
		const key = registry.mint();
		registry.for(key);
		states.get(key)!.conversationId = conversationId;
		registry.release(key);
		expect(registry.keyForConversation(conversationId)).toBeUndefined();
	});

	it('drops the store when its last holder releases it', () => {
		const key = registry.mint();
		registry.for(key);
		states.get(key)!.conversationId = conversationId;
		registry.release(key);
		expect({
			store: registry.peek(key),
			conversation: registry.keyForConversation(conversationId)
		}).toEqual({ store: undefined, conversation: undefined });
	});

	it('keeps the store while a second holder remains', () => {
		const key = registry.mint();
		const store = registry.for(key);
		registry.for(key);
		registry.release(key);
		try {
			expect(registry.peek(key)).toBe(store);
		} finally {
			registry.release(key);
		}
	});

	it('acquires a resident session that is not yet held', () => {
		const key = registry.mint();
		try {
			expect(registry.resident(key).sessionKey).toBe(key);
		} finally {
			registry.release(key);
		}
	});

	it('leaves the refcount alone when a resident session is read again', () => {
		const key = registry.mint();
		registry.resident(key);
		registry.resident(key);
		registry.release(key);
		expect(registry.isHeld(key)).toBe(false);
	});

	it('counts no streams when nothing is running', () => {
		const key = registry.mint();
		registry.for(key);
		try {
			expect(registry.streamingCount()).toBe(0);
		} finally {
			registry.release(key);
		}
	});

	it('counts a session whose run is in flight', () => {
		const key = registry.mint();
		registry.for(key);
		states.get(key)!.runStatus = 'running';
		try {
			expect({ streaming: registry.streamingCount(), atLimit: registry.atStreamLimit() }).toEqual({
				streaming: 1,
				atLimit: false
			});
		} finally {
			registry.release(key);
		}
	});

	it('reports the limit once four sessions stream at once', () => {
		const keys = [registry.mint(), registry.mint(), registry.mint(), registry.mint()];
		for (const key of keys) {
			registry.for(key);
			states.get(key)!.runStatus = 'running';
		}
		try {
			expect(registry.atStreamLimit()).toBe(true);
		} finally {
			for (const key of keys) registry.release(key);
		}
	});
});

it('reuses a reserved conversation key before its first pane mounts', () => {
	const first = registry.sessionKeyFor(conversationId);
	try {
		expect(registry.sessionKeyFor(conversationId)).toBe(first);
	} finally {
		registry.for(first);
		registry.release(first);
	}
});
it('does not route an old conversation to a session that switched away', () => {
	const key = registry.sessionKeyFor(conversationId);
	const session = registry.for(key);
	session.initialize('approval_required');
	states.get(key)!.conversationId = otherConversationId;
	try {
		expect(registry.keyForConversation(conversationId)).toBeUndefined();
	} finally {
		registry.release(key);
	}
});
