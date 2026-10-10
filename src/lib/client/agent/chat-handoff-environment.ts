import { goto } from '$app/navigation';
import { dockedPanelFits } from '$lib/hooks/is-docked-panel.svelte';
import { stageChatHandoff } from './chat-handoff-storage';
import type { ChatHandoff } from '$lib/models/chat';
import type { AskAgentDependencies } from '$lib/controllers/agent/chat-handoff';
import type { ChatSessionsController } from '$lib/controllers/agent/chat-sessions';
export interface ChatPanelTarget {
	readonly chatSessionKey: string;
	openChat(trigger?: HTMLElement): void;
}
export class BrowserChatHandoffEnvironment implements AskAgentDependencies {
	constructor(
		private readonly panel: ChatPanelTarget,
		private readonly sessions: ChatSessionsController
	) {}
	panelFits(): boolean {
		return dockedPanelFits();
	}
	openChat(trigger?: HTMLElement): void {
		this.panel.openChat(trigger);
	}
	stage(request: ChatHandoff): void {
		this.sessions.resident(this.panel.chatSessionKey).stage(request);
	}
	handoff(request: ChatHandoff): void {
		stageChatHandoff(request);
	}
	navigate(href: string): void {
		void goto(href);
	}
}
