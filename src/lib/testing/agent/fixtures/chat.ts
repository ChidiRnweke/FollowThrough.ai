import {
	Chat,
	type AgentRunClientStorage,
	type AgentRunTransport
} from '$lib/controllers/agent/chat.svelte';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { ContextChipsService } from '$lib/services/chat/chips';
import { InMemoryRunClientStorage } from '$lib/testing/agent/fakes/in-memory-run-client-storage';

/** One chat over a test's run server and tab storage, with the app's real chip and payload rules. */
export const testChat = (
	sessionKey: ChatSessionKey,
	transport: AgentRunTransport,
	storage: AgentRunClientStorage = new InMemoryRunClientStorage()
) => new Chat(sessionKey, transport, storage, new ContextChipsService());
