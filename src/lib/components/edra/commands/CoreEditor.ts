import type { EditorOptions, Storage } from '@tiptap/core';
import { Editor as TiptapEditor } from '@tiptap/core';
import type { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import type { NoteTodosStore } from '$lib/stores/note-todos.svelte';
import type { SuggestionTrayStore } from '$lib/stores/suggestion-tray.svelte';
import type { EditorSelectionStore } from '$lib/stores/editor-selection.svelte';
import type { NoteSyncStore } from '$lib/stores/note-sync.svelte';

/**
 * Per-note store instances attached to the TipTap editor so that NodeViews
 * rendered via {@link SvelteNodeViewRenderer} — which mount outside the
 * Svelte component tree and so can't read manipulated context — can still
 * find the right per-note store for the editor that owns them.
 */
export interface PerNoteEditorSlot {
	readonly todos: NoteTodosStore;
	readonly suggestions: SuggestionTrayStore;
	readonly selection: EditorSelectionStore;
	readonly sync: NoteSyncStore;
}

export class Editor extends TiptapEditor {
	public reactiveState: EditorState = this.view.state;
	public reactiveExtensionStorage: Storage = this.extensionStorage;
	/**
	 * Per-note store instances.  Set by `NoteEditor` after the editor is
	 * created so TipTap NodeViews (TodoNode, SuggestionInlineWidget) can
	 * read them via their {@link NodeViewProps.editor} prop without going
	 * through a singleton that would only describe the focused pane.
	 */
	public perNote?: PerNoteEditorSlot;

	constructor(options: Partial<EditorOptions> = {}) {
		super(options);
		this.reactiveState = this.view.state;
		this.reactiveExtensionStorage = this.extensionStorage;
		this.on('beforeTransaction', ({ nextState }) => {
			this.reactiveState = nextState;
			this.reactiveExtensionStorage = this.extensionStorage;
		});
	}

	get state() {
		return this.reactiveState ?? this.view.state;
	}

	get storage() {
		return this.reactiveExtensionStorage ?? super.storage;
	}

	public registerPlugin(
		plugin: Plugin,
		handlePlugins?: (newPlugin: Plugin, plugins: Plugin[]) => Plugin[]
	): EditorState {
		const nextState = super.registerPlugin(plugin, handlePlugins);
		if (this.reactiveState) this.reactiveState = nextState;
		return nextState;
	}

	public unregisterPlugin(nameOrPluginKey: string | PluginKey): EditorState | undefined {
		const nextState = super.unregisterPlugin(nameOrPluginKey);
		if (this.reactiveState && nextState) this.reactiveState = nextState;
		return nextState;
	}
}
