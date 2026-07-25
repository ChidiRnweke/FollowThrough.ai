import { goto } from '$app/navigation';
import type { TodoView } from '$lib/models';
import { dockedPanelFits } from '$lib/hooks/is-docked-panel.svelte';
import { rightPanel } from '$lib/stores/right-panel.svelte';

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
