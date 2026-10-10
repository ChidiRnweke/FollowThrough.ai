import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, type EdraEditorProps } from './editor';
import { editorOperationsFixture } from '$lib/testing/notes/fixtures/editor-operations';
import type { Editor } from './CoreEditor';

const mounted: { editor: Editor; element: HTMLElement; dispose: () => void }[] = [];
const mount = () => {
	const props: EdraEditorProps = {
		onCut: () => {
			void fixture.clipboard.cut(fixture.identity);
		}
	};
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
					src: document.createElement('canvas').toDataURL()
				}
			}
		]
	});
	editor.commands.selectAll();
	const fixture = editorOperationsFixture(editor);
	editor.commands.selectAll();
	mounted.push({
		editor,
		element: host,
		dispose: () => {
			fixture.controller.release();
			dispose();
		}
	});
	return fixture;
};
afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.dispose();
		entry.element.remove();
	}
});
const cut = (editor: import('@tiptap/core').Editor) =>
	editor.view.dom.dispatchEvent(
		new ClipboardEvent('cut', {
			bubbles: true,
			cancelable: true,
			clipboardData: new DataTransfer()
		})
	);

describe('cutting media from the editor', () => {
	it('keeps the source when the clipboard result is incomplete', async () => {
		const f = mount();
		f.writer.fail.add('rich');
		const before = f.editor.getJSON();
		cut(f.editor);
		await expect
			.poll(() => ({ document: f.editor.getJSON(), kept: f.input.kept }))
			.toEqual({ document: before, kept: [false] });
	});
	it('deletes the captured selection after a complete clipboard write', async () => {
		const f = mount();
		cut(f.editor);
		await expect.poll(() => f.editor.getText()).toBe('');
	});
	it('keeps intervening edits while an asynchronous clipboard write finishes', async () => {
		const f = mount();
		let finish!: () => void;
		f.writer.pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		cut(f.editor);
		f.editor.commands.setContent('<p>New work while copying</p>');
		finish();
		await expect
			.poll(() => ({ text: f.editor.getText(), kept: f.input.kept }))
			.toEqual({ text: 'New work while copying', kept: [true] });
	});
	it('does not delete a newly selected range while copying the captured range', async () => {
		const f = mount();
		let finish!: () => void;
		f.writer.pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		f.editor.commands.setNodeSelection(f.editor.state.doc.firstChild!.nodeSize);
		cut(f.editor);
		f.editor.commands.selectAll();
		finish();
		await expect
			.poll(() => ({
				text: f.editor.getText().trim(),
				hasImage: f.editor.getHTML().includes('<img')
			}))
			.toEqual({ text: 'Keep the surrounding prose', hasImage: false });
	});
});
