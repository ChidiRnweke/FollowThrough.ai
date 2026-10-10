import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import { type ChatSessionKey } from '$lib/models/chat';

export type RightPanelMode =
	'closed' | 'chat' | 'todo-detail' | 'project-memory' | 'suggestions' | 'search';

export class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoId = $state<TodoId | undefined>(undefined);
	memoryProjectId = $state<ProjectId | undefined>(undefined);
	chatTrigger: HTMLElement | undefined;
	/** The panel keeps its session key while hidden; chat controllers own acquisition and release. */
	chatSessionKey = $state<ChatSessionKey>(crypto.randomUUID());
	private focusChatComposer: (() => void) | undefined;
	private chatComposerFocusPending = false;
	private focusSearchInput: (() => void) | undefined;
	private searchInputFocusPending = false;

	setChatSession(key: ChatSessionKey): void {
		this.chatSessionKey = key;
	}

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
	/** Same hand-off as the chat composer: the panel registers its input once mounted. */
	registerSearchInputFocus(focus: () => void): () => void {
		this.focusSearchInput = focus;
		if (this.searchInputFocusPending) {
			this.searchInputFocusPending = false;
			focus();
		}
		return () => {
			if (this.focusSearchInput === focus) this.focusSearchInput = undefined;
		};
	}
	requestSearchInputFocus(): void {
		if (this.focusSearchInput) this.focusSearchInput();
		else this.searchInputFocusPending = true;
	}
	restoreChatTriggerFocus(): void {
		this.chatTrigger?.focus();
		this.chatTrigger = undefined;
	}
	openTodo(todoId: TodoId): void {
		this.todoId = todoId;
		this.mode = 'todo-detail';
	}
	openMemory(projectId: ProjectId): void {
		this.memoryProjectId = projectId;
		this.mode = this.mode === 'project-memory' ? 'closed' : 'project-memory';
	}
	openSuggestions(): void {
		this.mode = 'suggestions';
	}
	openSearch(): void {
		this.mode = 'search';
	}
	toggle(mode: RightPanelMode): void {
		this.mode = this.mode === mode ? 'closed' : mode;
	}
	close(): void {
		this.mode = 'closed';
		// A focus request aimed at a panel that is closing is stale: the next ⌘⇧F
		// or ⌘⇧I re-issues its own request after reopening, so a leftover pending
		// flag would only surface as a surprise focus on the next mount.
		this.chatComposerFocusPending = false;
		this.searchInputFocusPending = false;
	}
}

export const rightPanel = new RightPanelStore();
