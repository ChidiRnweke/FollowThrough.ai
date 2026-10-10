import { ChatChipService } from '$lib/services/chat/chips';
import { ChatSession, type ChatSessionController } from '$lib/controllers/agent/chat-session';
import { ChatSessions, type ChatSessionsController } from '$lib/controllers/agent/chat-sessions';
import { ChatSessionState } from '$lib/stores/agent/chat-session.svelte';
import { ChatSessionsState } from '$lib/stores/agent/chat-sessions';
import { RemoteAgentRunTransport } from '$lib/client/agent/runs/remote-transport';
import { SessionAgentRunStorage } from '$lib/client/agent/runs/session-storage';
import { SessionChatChoicesStorage } from '$lib/client/agent/chat-choices-storage';
import { BrowserChatPayloadReader } from '$lib/client/agent/chat-payload-reader';
import { BrowserChatEnvironment } from '$lib/client/agent/chat-environment';
import { ChatTranscriptService } from '$lib/services/chat/transcript';
import type { ChatSessionKey } from '$lib/models/chat';
import { rememberChatConversation } from '$lib/client/agent/chat-choices-storage';
import { appContext } from '$lib/factories/agent/app-context';
export const createChatSession = (key: ChatSessionKey): ChatSessionController =>
	new ChatSession(
		key,
		new ChatSessionState(),
		new RemoteAgentRunTransport(),
		new SessionAgentRunStorage(key),
		new SessionChatChoicesStorage(key),
		new BrowserChatPayloadReader(),
		new ChatTranscriptService(),
		appContext,
		new BrowserChatEnvironment(),
		new ChatChipService()
	);
export const chatRegistry: ChatSessionsController = new ChatSessions(new ChatSessionsState(), {
	create: createChatSession,
	remember: rememberChatConversation
});
