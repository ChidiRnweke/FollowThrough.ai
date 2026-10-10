import { ChatPanel, type ChatPanelController } from '$lib/controllers/agent/chat-panel';
import { ChatHandoffs, type ChatHandoffController } from '$lib/controllers/agent/chat-handoff';
import { BrowserChatHandoffEnvironment } from '$lib/client/agent/chat-handoff-environment';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
import { chatRegistry } from './chat';
export const chatHandoff: ChatHandoffController = new ChatHandoffs(
	new BrowserChatHandoffEnvironment(rightPanel, chatRegistry)
);

export const chatPanel: ChatPanelController = new ChatPanel(rightPanel, chatRegistry);
