import type { ChatSessionsController } from './chat-sessions';
export interface ChatPanelState {
	readonly chatSessionKey: string;
	setChatSession(key: string): void;
}
export interface ChatPanelController {
	newChat(): void;
	reset(): void;
}
export class ChatPanel implements ChatPanelController {
	constructor(
		private readonly panel: ChatPanelState,
		private readonly sessions: ChatSessionsController
	) {}
	reset(): void {
		this.panel.setChatSession(this.sessions.mint());
	}
	newChat(): void {
		this.sessions.release(this.panel.chatSessionKey);
		const key = this.sessions.mint();
		this.sessions.for(key);
		this.panel.setChatSession(key);
	}
}
