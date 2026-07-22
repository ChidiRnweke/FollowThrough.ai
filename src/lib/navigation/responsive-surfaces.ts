import { goto } from '$app/navigation';
import type { TodoView } from '$lib/models';
import { rightPanel } from '$lib/stores/right-panel.svelte';

const wideWorkbench = (): boolean =>
	typeof window !== 'undefined' && window.matchMedia('(min-width: 96rem)').matches;

export function openTodoSurface(view: TodoView, returnTo: string): void {
	if (wideWorkbench()) {
		rightPanel.openTodo(view);
		return;
	}
	void goto(`/todos/${view.todo.id}?returnTo=${encodeURIComponent(returnTo)}`);
}

export function openChatSurface(): void {
	if (wideWorkbench()) rightPanel.openChat();
	else void goto('/chats/new');
}
