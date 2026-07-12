import type { TodoView } from '$lib/models';

export type RightPanelMode = 'closed' | 'chat' | 'suggestions' | 'todo-detail';

class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoView = $state<TodoView | undefined>(undefined);

	openChat(): void {
		this.mode = 'chat';
	}
	openSuggestions(): void {
		this.mode = 'suggestions';
	}
	openTodo(view: TodoView): void {
		this.todoView = view;
		this.mode = 'todo-detail';
	}
	toggle(mode: RightPanelMode): void {
		this.mode = this.mode === mode ? 'closed' : mode;
	}
	close(): void {
		this.mode = 'closed';
	}
}

export const rightPanel = new RightPanelStore();
