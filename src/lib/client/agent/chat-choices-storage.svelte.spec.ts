import { expect, it } from 'vitest';
import { SessionChatChoicesStorage, rememberChatConversation } from './chat-choices-storage';
import { testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
it('preserves saved model choices when binding a conversation before mounting', () => {
	const key = crypto.randomUUID();
	const storage = new SessionChatChoicesStorage(key);
	storage.save({ modelOverride: 'test/model', executionModeOverride: 'auto_accept' });
	rememberChatConversation(key, testConversationId());
	expect(storage.load()).toEqual({
		kind: 'valid',
		choices: {
			conversationId: testConversationId(),
			modelOverride: 'test/model',
			executionModeOverride: 'auto_accept'
		}
	});
});
