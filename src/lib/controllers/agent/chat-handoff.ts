import type { ChatHandoff } from '$lib/models/chat';
export interface AskAgentDependencies {
	readonly panelFits: () => boolean;
	readonly openChat: (trigger?: HTMLElement) => void;
	readonly stage: (request: ChatHandoff) => void;
	readonly handoff: (request: ChatHandoff) => void;
	readonly navigate: (href: string) => void;
}

export interface ChatHandoffController {
	ask(request: ChatHandoff, trigger?: HTMLElement): void;
}
/** Stage the prompt in the mounted panel or carry it across navigation; sending remains explicit. */
export class ChatHandoffs implements ChatHandoffController {
	constructor(private readonly dependencies: AskAgentDependencies) {}
	ask(request: ChatHandoff, trigger?: HTMLElement): void {
		if (this.dependencies.panelFits()) {
			this.dependencies.openChat(trigger);
			this.dependencies.stage(request);
			return;
		}
		this.dependencies.handoff(request);
		this.dependencies.navigate('/chats/new');
	}
}
