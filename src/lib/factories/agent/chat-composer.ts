import { ChatComposer, type ChatComposerController } from '$lib/controllers/agent/chat-composer';
import type { ChatSessionController } from '$lib/controllers/agent/chat-session';
import { ChatComposerState } from '$lib/stores/agent/chat-composer.svelte';
import { ChatChipService } from '$lib/services/chat/chips';
import { SessionChatDraftStorage } from '$lib/client/agent/chat-draft-storage';
import { agentContext } from './context';
import { agentSelectionContext } from './selection-context';
import { chatRegistry } from './chat';
import { takeCanvasRender } from '$lib/stores/diagrams/canvas-render.svelte';
export const createChatComposer = (chat: ChatSessionController): ChatComposerController =>
	new ChatComposer(
		new ChatComposerState(),
		chat,
		agentContext,
		agentSelectionContext,
		new ChatChipService(),
		new SessionChatDraftStorage(chat.sessionKey),
		{ atStreamLimit: () => chatRegistry.atStreamLimit(), takeCanvasRender }
	);
