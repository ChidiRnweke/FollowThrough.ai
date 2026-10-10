import type { ConversationId } from '$lib/models/agent';
import {
	persistedConversationSchema,
	type PersistedConversationChoices,
	type PersistedConversationResult
} from '$lib/models/chat';
import type { ChatChoicesStorage } from '$lib/controllers/agent/chat-session';
export class SessionChatChoicesStorage implements ChatChoicesStorage {
	private readonly key: string;
	constructor(sessionKey: string) {
		this.key = `followthrough.agent.conversation.${sessionKey}`;
	}
	load(): PersistedConversationResult {
		if (typeof sessionStorage === 'undefined') return { kind: 'missing' };
		const stored = sessionStorage.getItem(this.key);
		if (stored === null) return { kind: 'missing' };
		try {
			return { kind: 'valid', choices: persistedConversationSchema.parse(JSON.parse(stored)) };
		} catch (error) {
			return {
				kind: 'corrupt',
				message: error instanceof Error ? error.message : 'Saved conversation state is unreadable'
			};
		}
	}
	save(choices: PersistedConversationChoices): void {
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.setItem(this.key, JSON.stringify(choices));
	}
	clear(): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.key);
	}
}

export const rememberChatConversation = (key: string, conversationId: ConversationId): void => {
	const storage = new SessionChatChoicesStorage(key);
	const existing = storage.load();
	if (existing.kind === 'corrupt') throw new Error(existing.message);
	storage.save({ ...(existing.kind === 'valid' ? existing.choices : {}), conversationId });
};
