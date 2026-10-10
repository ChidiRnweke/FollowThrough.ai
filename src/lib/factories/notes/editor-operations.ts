import { TiptapDocumentCopy } from '$lib/client/notes/editor-document';
import { NoteDocumentPresentationService } from '$lib/services/notes/document-presentation';
import { TiptapNoteEditor } from '$lib/client/notes/tiptap-editor';
import {
	NoteEditor,
	type NoteEditorLifecycle,
	type NoteEditorOperations
} from '$lib/controllers/notes/editor-operations';
import type { NoteEditorEvents, NoteEditorView } from '$lib/models/browser-workspace';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import type { Editor } from '@tiptap/core';
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
		new TiptapDocumentCopy(),
		new NoteDocumentPresentationService(),
		events,
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
