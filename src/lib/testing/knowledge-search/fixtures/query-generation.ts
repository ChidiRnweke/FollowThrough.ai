import type { StoredMessage } from '$lib/models/agent';
import { testConversationId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

export const searchHistory: readonly StoredMessage[] = ['first question', 'more context'].map(
	(text) => ({
		kind: 'readable',
		id: crypto.randomUUID() as StoredMessage['id'],
		conversationId: testConversationId(),
		role: 'user',
		content: { text },
		createdAt: testNow
	})
);
