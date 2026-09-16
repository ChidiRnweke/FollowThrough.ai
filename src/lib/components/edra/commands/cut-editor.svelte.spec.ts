import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, type EdraEditorProps } from './editor';
import type { Editor } from './CoreEditor';

const mounted: { editor: Editor; element: HTMLElement; dispose: () => void }[] = [];
const mount = (props: EdraEditorProps): Editor => {
	const element = document.createElement('div');
	const host = document.createElement('div');
	host.appendChild(element);
	document.body.appendChild(host);
	let created: Editor | undefined;
	const dispose = $effect.root(() => {
		created = createEditor(props);
	});
	if (!created) throw new Error('Editor was not created');
	const editor = created;
	editor.setOptions({ element });
	editor.commands.setContent({
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Keep the surrounding prose' }] },
			{
				type: 'image',
				attrs: {
					src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
				}
			}
		]
	});
	editor.commands.selectAll();
	mounted.push({ editor, element: host, dispose });
	return editor;
};
afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.dispose();
		entry.element.remove();
	}
});
const cut = (editor: Editor) =>
	editor.view.dom.dispatchEvent(
		new ClipboardEvent('cut', {
			bubbles: true,
			cancelable: true,
			clipboardData: new DataTransfer()
		})
	);

describe('cutting media from the editor', () => {
	it('keeps the source when the clipboard result is incomplete', async () => {
		const editor = mount({ onCut: async () => false });
		const before = editor.getJSON();
		cut(editor);
		await Promise.resolve();
		expect(editor.getJSON()).toEqual(before);
	});
	it('deletes the captured selection after a complete clipboard write', async () => {
		const editor = mount({ onCut: async () => true });
		cut(editor);
		await Promise.resolve();
		expect(editor.getJSON()).toEqual({
			type: 'doc',
			content: [{ type: 'paragraph', attrs: { textAlign: null } }]
		});
	});
	it('keeps intervening edits while an asynchronous clipboard write finishes', async () => {
		let finish: (complete: boolean) => void = () => {
			throw new Error('Copy did not begin');
		};
		const editor = mount({
			onCut: () =>
				new Promise((resolve) => {
					finish = resolve;
				})
		});
		cut(editor);
		editor.commands.setContent('<p>New work while copying</p>');
		finish(true);
		await Promise.resolve();
		expect(editor.getText()).toBe('New work while copying');
	});
	it('does not delete a newly selected range while copying the captured range', async () => {
		let finish: (complete: boolean) => void = () => {
			throw new Error('Copy did not begin');
		};
		const editor = mount({
			onCut: () =>
				new Promise((resolve) => {
					finish = resolve;
				})
		});
		editor.commands.setNodeSelection(editor.state.doc.firstChild!.nodeSize);
		cut(editor);
		editor.commands.selectAll();
		finish(true);
		await Promise.resolve();
		expect({ text: editor.getText().trim(), hasImage: editor.getHTML().includes('<img') }).toEqual({
			text: 'Keep the surrounding prose',
			hasImage: false
		});
	});
});
