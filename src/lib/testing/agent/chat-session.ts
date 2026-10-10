import { ChatChipService } from '$lib/services/chat/chips';
import { InMemoryRunClientStorage } from '$lib/testing/agent/fakes/in-memory-run-client-storage';
import { ChatSession } from '$lib/controllers/agent/chat-session';
import { ChatSessionState } from '$lib/stores/agent/chat-session.svelte';
import type {
	AgentRunTransport,
	AgentRunClientStorage
} from '$lib/controllers/agent/run-transport';
import { SessionChatChoicesStorage } from '$lib/client/agent/chat-choices-storage';
import { BrowserChatPayloadReader } from '$lib/client/agent/chat-payload-reader';
import { BrowserChatEnvironment } from '$lib/client/agent/chat-environment';
import { ChatTranscriptService } from '$lib/services/chat/transcript';
import { appContext } from '$lib/factories/agent/app-context';
export const createChatFixture = (
	key: string,
	transport: AgentRunTransport,
	storage: AgentRunClientStorage = new InMemoryRunClientStorage()
) => {
	const state = new ChatSessionState();
	const chat = new ChatSession(
		key,
		state,
		transport,
		storage,
		new SessionChatChoicesStorage(key),
		new BrowserChatPayloadReader(),
		new ChatTranscriptService(),
		appContext,
		new BrowserChatEnvironment(),
		new ChatChipService()
	);
	return { chat, state };
};
