import type { ChatSessionKey } from '$lib/models/chat';
import type { ChatSessionController } from '$lib/controllers/agent/chat-session';
export class ChatSessionsState {
	readonly sessions = new Map<
		ChatSessionKey,
		{ readonly session: ChatSessionController; references: number }
	>();
	readonly conversations = new Map<string, ChatSessionKey>();
}
