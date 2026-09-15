import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';

export type RightPanelMode =
	'closed' | 'chat' | 'todo-detail' | 'project-memory' | 'suggestions' | 'search';

export class RightPanelStore {
	mode = $state<RightPanelMode>('closed');
	todoId = $state<TodoId | undefined>(undefined);
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
	private focusSearchInput: (() => void) | undefined;
	private searchInputFocusPending = false;

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
