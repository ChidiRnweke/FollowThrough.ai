import type { ProjectId, TodoView } from '$lib/models';

export type RightPanelMode = 'closed' | 'chat' | 'todo-detail' | 'project-memory';

class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoView = $state<TodoView | undefined>(undefined);
	memoryProjectId = $state<ProjectId | undefined>(undefined);

	openChat(): void {
		this.mode = 'chat';
	}
	openTodo(view: TodoView): void {
		this.todoView = view;
		this.mode = 'todo-detail';
	}
	openMemory(projectId: ProjectId): void {
		this.memoryProjectId = projectId;
		this.mode = this.mode === 'project-memory' ? 'closed' : 'project-memory';
	}
	toggle(mode: RightPanelMode): void {
		this.mode = this.mode === mode ? 'closed' : mode;
	}
	close(): void {
		this.mode = 'closed';
	}
}

export const rightPanel = new RightPanelStore();
