import type { ProjectId } from '$lib/models/projects';
import type { TodoView } from '$lib/models/todos';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';

export type RightPanelMode = 'closed' | 'chat' | 'todo-detail' | 'project-memory' | 'suggestions';

export class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoView = $state<TodoView | undefined>(undefined);
	memoryProjectId = $state<ProjectId | undefined>(undefined);
	chatTrigger: HTMLElement | undefined;
	/**
	 * The panel's own chat session, held for the app's lifetime rather than per
	 * mount: `ChatPanel` lives inside the panel's `{#if}`, so acquiring on mount
	 * would throw the transcript away every time the panel was closed.
	 *
	 * Acquired once here rather than on first open, which also bounds it during
	 * SSR — the store is a module singleton, so the server takes exactly one
	 * registry entry for the process rather than one per request.
	 */
	chatSessionKey = $state<ChatSessionKey>(chatRegistry.mint());
	private focusChatComposer: (() => void) | undefined;
	private chatComposerFocusPending = false;

	constructor() {
		chatRegistry.for(this.chatSessionKey);
	}

	/**
	 * Start over. The old session is released — dropping its transcript and its
	 * stream — and a fresh key takes its place; the panel's `ChatPanel` re-keys
	 * on it. This replaces the old `chat.clear()`, which mutated the one shared
	 * store and so cleared every surface at once.
	 */
	newChat(): void {
		chatRegistry.release(this.chatSessionKey);
		const next = chatRegistry.mint();
		chatRegistry.for(next);
		this.chatSessionKey = next;
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
