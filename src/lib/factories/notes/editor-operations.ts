import { BrowserClipboardFeedback } from '$lib/client/clipboard/feedback';
import { TiptapNoteEditor } from '$lib/client/notes/tiptap-editor';
import {
	NoteEditor,
	type NoteEditorLifecycle,
	type NoteEditorOperations,
	type NoteEditorView
} from '$lib/controllers/notes/editor-operations';
import type { NoteEditorEvents } from '$lib/models/browser-workspace';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import type { Editor } from '@tiptap/core';
import { noteClipboard } from './clipboard';
import { noteDocuments } from './document-presentation';
import { noteEditorCapabilities } from './editor-capabilities';
export interface NoteEditorBinding {
	readonly operations: NoteEditorOperations;
	readonly lifecycle: NoteEditorLifecycle;
	readonly view: NoteEditorView;
	readonly holdingSelection: boolean;
}
export function createNoteEditorOperations(
	editor: Editor,
	events: NoteEditorEvents
): NoteEditorBinding {
	const state = new NoteEditorOperationStore();
	const port = new TiptapNoteEditor(editor);
	const identity = { key: Symbol('note-editor') };
	const controller = new NoteEditor(
		state,
		port,
		noteDocuments,
		noteClipboard,
		events,
		new BrowserClipboardFeedback(),
		identity
	);
	noteEditorCapabilities.set(identity, { port, state, events });
	return {
		operations: controller,
		lifecycle: controller,
		view: state.view,
		get holdingSelection() {
			return state.holdingSelection;
		}
	};
}
