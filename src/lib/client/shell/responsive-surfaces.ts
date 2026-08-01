import { goto } from '$app/navigation';
import type { TodoView } from '$lib/models/todos';
import { dockedPanelFits } from '$lib/hooks/is-docked-panel.svelte';
import { chat } from '$lib/stores/agent/chat.svelte';
import { stageChatHandoff, type ChatHandoff } from '$lib/stores/agent/chat-handoff';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';

export function openTodoSurface(view: TodoView, returnTo: string): void {
	if (dockedPanelFits()) {
		rightPanel.openTodo(view);
		return;
	}
	void goto(`/todos/${view.todo.id}?returnTo=${encodeURIComponent(returnTo)}`);
}

export function openChatSurface(trigger?: HTMLElement): void {
	rightPanel.openChat(trigger);
}

export interface AskAgentDependencies {
	readonly panelFits: () => boolean;
	readonly openChat: (trigger?: HTMLElement) => void;
	readonly stage: (request: ChatHandoff) => void;
	readonly handoff: (request: ChatHandoff) => void;
	readonly navigate: (href: string) => void;
}

export const createAskAgent =
	(dependencies: AskAgentDependencies) =>
	(request: ChatHandoff, trigger?: HTMLElement): void => {
		if (dependencies.panelFits()) {
			dependencies.openChat(trigger);
			dependencies.stage(request);
			return;
		}
		dependencies.handoff(request);
		dependencies.navigate('/chats/new');
	};

/**
 * Open the chat with a prompt already written, from anywhere in the app.
 *
 * This is the one path for every invocation point, so they all behave the same:
 * the prompt is *prefilled, never sent*. It also lands in the current conversation
 * rather than clearing it — starting fresh stays the panel's `+` button's job.
 *
 * The two branches differ only in where the panel is about to exist. Docked, it is
 * mounted already, so the prompt goes through the store. Below the docked
 * breakpoint the chat is a whole page away, so the prompt rides sessionStorage
 * across the navigation instead.
 */
export const askAgent = createAskAgent({
	panelFits: dockedPanelFits,
	openChat: (trigger) => rightPanel.openChat(trigger),
	stage: (request) => chat.stage(request),
	handoff: stageChatHandoff,
	navigate: (href) => void goto(href)
});
