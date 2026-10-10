import { goto } from '$app/navigation';
import type { TodoView } from '$lib/models/todos';
import { dockedPanelFits } from '$lib/hooks/is-docked-panel.svelte';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';

export function openTodoSurface(view: TodoView, returnTo: string): void {
	if (dockedPanelFits()) {
		rightPanel.openTodo(view.todo.id);
		return;
	}
	void goto(`/todos/${view.todo.id}?returnTo=${encodeURIComponent(returnTo)}`);
}

export function openChatSurface(trigger?: HTMLElement): void {
	rightPanel.openChat(trigger);
}
