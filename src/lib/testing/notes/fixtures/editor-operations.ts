import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { createSelectionActionPlugin } from '$lib/client/notes/selection-action-plugin';
import { TiptapNoteEditor } from '$lib/client/notes/tiptap-editor';
import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import type { NoteWorkspaceEditor } from '$lib/models/browser-workspace';
import { TiptapDocumentCopy } from '$lib/client/notes/editor-document';
import { NoteDocumentPresentationService } from '$lib/services/notes/document-presentation';
import { readClipboardImage } from '$lib/client/clipboard/images';
import {
	NoteClipboard,
	type NoteClipboardDependencies
} from '$lib/controllers/notes/clipboard-operations';
import { NoteEditor } from '$lib/controllers/notes/editor-operations';
import type { NoteEditorEvents } from '$lib/models/browser-workspace';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { Editor } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { InMemoryClipboard } from '../fakes/in-memory-clipboard';
import { InMemoryClipboardInput } from '../fakes/in-memory-clipboard-input';
export const editorOperationsFixture = (mountedEditor?: Editor) => {
	const editor =
		mountedEditor ??
		new Editor({
			element: document.createElement('div'),
			extensions: [StarterKit, TableKit]
		});
	const element = editor.view.dom;
	document.body.append(element);
	editor.registerPlugin(createSelectionActionPlugin());
	const input = new InMemoryClipboardInput();
	const writer = new InMemoryClipboard();
	const state = new NoteEditorOperationStore();
	const adapter = new TiptapNoteEditor(editor);
	let changes = 0;
	const controller = new NoteEditor(
		state,
		adapter,
		new TiptapDocumentCopy(),
		new NoteDocumentPresentationService(),
		capabilityDependencies<NoteEditorEvents>({})
	);
	editor.on('update', () => {
		if (state.view.acceptsChanges) changes++;
	});
	controller.initialize(
		mountedEditor
			? adapter.getDocument()
			: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]
				}
	);
	const editors = new WorkspaceCapabilityStore<NoteWorkspaceEditor>();
	editors.set(controller.identity, {
		port: adapter,
		state,
		events: capabilityDependencies<NoteEditorEvents>({})
	});
	const clipboard = new NoteClipboard(
		capabilityDependencies<NoteClipboardDependencies>({
			editors,
			writer,
			reader: input,
			feedback: input,
			document: (content) => new BrowserClipboardDocument(content),
			readImage: readClipboardImage
		})
	);
	return {
		editor,
		editors,
		identity: controller.identity,
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
			element.remove();
			editor.destroy();
		}
	};
};
