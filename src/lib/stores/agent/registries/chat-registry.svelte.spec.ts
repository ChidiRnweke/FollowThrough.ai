import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import { ChatRegistry } from './chat-registry.svelte';

const conversationId = '20000000-0000-4000-8000-000000000001' as ConversationId;
const otherConversationId = '20000000-0000-4000-8000-000000000002' as ConversationId;

/**
 * The registry's module-level map is shared, so each test takes its own keys and
 * releases them; `ChatRegistry` is a thin facade over that one map.
 */
const registry = new ChatRegistry();

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
		registry.for(key).conversationId = conversationId;
		try {
			expect(registry.keyForConversation(conversationId)).toBe(key);
		} finally {
			registry.release(key);
		}
	});

	it('reports no session for a conversation nothing has open', () => {
		const key = registry.mint();
		registry.for(key).conversationId = conversationId;
		try {
			expect(registry.keyForConversation(otherConversationId)).toBeUndefined();
		} finally {
			registry.release(key);
		}
	});

	it('forgets a conversation once its session is released', () => {
		const key = registry.mint();
		registry.for(key).conversationId = conversationId;
		registry.release(key);
		expect(registry.keyForConversation(conversationId)).toBeUndefined();
	});

	it('drops the store when its last holder releases it', () => {
		const key = registry.mint();
		registry.for(key);
		registry.release(key);
		expect(registry.peek(key)).toBeUndefined();
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
		registry.for(key).runStatus = 'running';
		try {
			expect(registry.streamingCount()).toBe(1);
		} finally {
			registry.release(key);
		}
	});

	it('stays under the stream limit with a single run in flight', () => {
		const key = registry.mint();
		registry.for(key).runStatus = 'running';
		try {
			expect(registry.atStreamLimit()).toBe(false);
		} finally {
			registry.release(key);
		}
	});

	it('reports the limit once four sessions stream at once', () => {
		const keys = [registry.mint(), registry.mint(), registry.mint(), registry.mint()];
		for (const key of keys) registry.for(key).runStatus = 'running';
		try {
			expect(registry.atStreamLimit()).toBe(true);
		} finally {
			for (const key of keys) registry.release(key);
		}
	});
});
