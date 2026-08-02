import type { ProjectId } from '$lib/models/projects';
import type { TodoView } from '$lib/models/todos';

export type RightPanelMode = 'closed' | 'chat' | 'todo-detail' | 'project-memory' | 'suggestions';

export class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoView = $state<TodoView | undefined>(undefined);
	memoryProjectId = $state<ProjectId | undefined>(undefined);
	chatTrigger: HTMLElement | undefined;
	private focusChatComposer: (() => void) | undefined;
	private chatComposerFocusPending = false;

	openChat(trigger?: HTMLElement): void {
		this.chatTrigger = trigger;
		this.mode = 'chat';
	}
	registerChatComposerFocus(focus: () => void): () => void {
		this.focusChatComposer = focus;
		if (this.chatComposerFocusPending) {
			this.chatComposerFocusPending = false;
			focus();
		}
		return () => {
			if (this.focusChatComposer === focus) this.focusChatComposer = undefined;
		};
	}
	requestChatComposerFocus(): void {
		if (this.focusChatComposer) this.focusChatComposer();
		else this.chatComposerFocusPending = true;
	}
	restoreChatTriggerFocus(): void {
		this.chatTrigger?.focus();
		this.chatTrigger = undefined;
	}
	openTodo(view: TodoView): void {
		this.todoView = view;
		this.mode = 'todo-detail';
	}
	openMemory(projectId: ProjectId): void {
		this.memoryProjectId = projectId;
		this.mode = this.mode === 'project-memory' ? 'closed' : 'project-memory';
	}
	openSuggestions(): void {
		this.mode = 'suggestions';
	}
	toggle(mode: RightPanelMode): void {
		this.mode = this.mode === mode ? 'closed' : mode;
	}
	close(): void {
		this.mode = 'closed';
	}
}

export const rightPanel = new RightPanelStore();
