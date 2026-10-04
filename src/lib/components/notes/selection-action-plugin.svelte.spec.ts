import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteEditor from './note-editor.svelte';
import { selectionActionKey } from './selection-action-plugin';
import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

const renderNote = async () => {
	const screen = await render(NoteEditor, {
		noteId: '11111111-1111-4111-8111-111111111111' as NoteId,
		projectId: '22222222-2222-4222-8222-222222222222' as ProjectId,
		revision: 1,
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world.' }] }]
		} satisfies ProseMirrorDocument,
		onreviseMermaid: async (source: string) => ({ source }),
		onconvertMermaid: async () => {
			throw new Error('Not used by this test');
		},
		onrejectDrawio: async () => undefined
	});
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	const editor = screen.component.getEditor();
	if (!editor) throw new Error('Note editor did not mount');
	return { screen, editor };
};

describe('selection action plugin rendered washes', () => {
	it('renders the running selection wash on the selected text', async () => {
		const { screen, editor } = await renderNote();
		editor.view.dispatch(editor.view.state.tr.setMeta(selectionActionKey, { from: 1, to: 6 }));
		await expect
			.element(screen.getByText('Hello', { exact: true }))
			.toHaveClass('selection-action-range');
	});

	it('renders the held selection wash on the selected text', async () => {
		const { screen, editor } = await renderNote();
		editor.view.dispatch(
			editor.view.state.tr.setMeta(selectionActionKey, { from: 1, to: 6, variant: 'held' })
		);
		await expect.element(screen.getByText('Hello', { exact: true })).toHaveClass('selection-held');
	});
});
