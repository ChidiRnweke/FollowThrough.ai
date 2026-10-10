import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TiptapNoteEditor } from '$lib/client/notes/tiptap-editor';
import { NoteEditor, type NoteEditorEvents } from '$lib/controllers/notes/editor-operations';
import { NoteClipboard } from '$lib/controllers/notes/clipboard-operations';
import { ClipboardTransfer, type ClipboardDependencies } from '$lib/controllers/notes/clipboard';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import { noteDocuments } from '$lib/factories/notes/document-presentation';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { InMemoryClipboard } from '../fakes/in-memory-clipboard';
import { InMemoryClipboardInput } from '../fakes/in-memory-clipboard-input';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { createSelectionActionPlugin } from '$lib/client/notes/selection-action-plugin';
export const editorOperationsFixture = () => {
	const editor = new Editor({
		element: document.createElement('div'),
		extensions: [StarterKit, TableKit]
	});
	document.body.append(editor.view.dom);
	editor.registerPlugin(createSelectionActionPlugin());
	const input = new InMemoryClipboardInput();
	const writer = new InMemoryClipboard();
	const transfer = new ClipboardTransfer(
		capabilityDependencies<ClipboardDependencies>({
			writer,
			document: (content: import('$lib/models/clipboard').RichClipboardContent) =>
				new BrowserClipboardDocument(content)
		})
	);
	const clipboard = new NoteClipboard(transfer, writer, input, input);
	const state = new NoteEditorOperationStore();
	const adapter = new TiptapNoteEditor(editor);
	let changes = 0;
	const controller = new NoteEditor(
		state,
		adapter,
		noteDocuments,
		clipboard,
		capabilityDependencies<NoteEditorEvents>({
			changed: () => {
				changes++;
			}
		}),
		input
	);
	editor.on('update', () => controller.changed());
	controller.initialize({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]
	});
	return {
		editor,
		input,
		writer,
		state,
		adapter,
		clipboard,
		controller,
		get changes() {
			return changes;
		},
		dispose() {
			controller.release();
			editor.view.dom.remove();
			editor.destroy();
		}
	};
};
