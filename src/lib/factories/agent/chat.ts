import { Chat } from '$lib/controllers/agent/chat.svelte';
import type { ChatSession, ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { RemoteAgentRunTransport } from '$lib/client/agent/runs/remote-transport';
import { SessionAgentRunStorage } from '$lib/client/agent/runs/session-storage';
import { ContextChipsService } from '$lib/services/chat/chips';

/** One chat session over the server's run functions and this tab's session storage. */
export const createChat = (sessionKey: ChatSessionKey): ChatSession =>
	new Chat(
		sessionKey,
		new RemoteAgentRunTransport(),
		new SessionAgentRunStorage(sessionKey),
		new ContextChipsService()
	);
