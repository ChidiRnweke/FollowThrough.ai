import { BrowserClipboardFeedback } from '$lib/client/clipboard/feedback';
import type { Editor } from '@tiptap/core';
import { TiptapNoteEditor } from '$lib/client/notes/tiptap-editor';
import {
	NoteEditor,
	type NoteEditorEvents,
	type NoteEditorLifecycle,
	type NoteEditorOperations,
	type NoteEditorView
} from '$lib/controllers/notes/editor-operations';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import { noteDocuments } from './document-presentation';
import { noteClipboard } from './clipboard';
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
	const controller = new NoteEditor(
		state,
		new TiptapNoteEditor(editor),
		noteDocuments,
		noteClipboard,
		events,
		new BrowserClipboardFeedback()
	);
	return {
		operations: controller,
		lifecycle: controller,
		view: state.view,
		get holdingSelection() {
			return state.holdingSelection;
		}
	};
}
