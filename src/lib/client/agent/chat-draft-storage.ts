import type { ChatDraftStorage } from '$lib/controllers/agent/chat-composer';
import { consumeChatHandoff } from './chat-handoff-storage';
export class SessionChatDraftStorage implements ChatDraftStorage {
	private readonly key: string;
	constructor(sessionKey: string) {
		this.key = `followthrough.chat.draft.${sessionKey}`;
	}
	read(): string {
		return typeof sessionStorage === 'undefined' ? '' : (sessionStorage.getItem(this.key) ?? '');
	}
	save(text: string): void {
		if (typeof sessionStorage === 'undefined') return;
		if (text) sessionStorage.setItem(this.key, text);
		else sessionStorage.removeItem(this.key);
	}
	consumeHandoff() {
		return typeof sessionStorage === 'undefined' ? undefined : consumeChatHandoff();
	}
}
