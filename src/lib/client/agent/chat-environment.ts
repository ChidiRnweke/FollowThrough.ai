import { isHttpError } from '@sveltejs/kit';
import type { ChatEnvironment } from '$lib/controllers/agent/chat-session';
export class BrowserChatEnvironment implements ChatEnvironment {
	get online(): boolean {
		return typeof navigator === 'undefined' || navigator.onLine;
	}
	id(): string {
		return crypto.randomUUID();
	}
	rejectionMessage(error: object): string | undefined {
		if (!isHttpError(error) || error.status < 400 || error.status >= 500) return undefined;
		return error.body.message.length > 0 ? error.body.message : 'That request was rejected.';
	}
}
