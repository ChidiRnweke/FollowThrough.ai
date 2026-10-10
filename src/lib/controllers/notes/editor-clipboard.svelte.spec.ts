import { afterEach, describe, expect, it } from 'vitest';
import { editorOperationsFixture } from '$lib/testing/notes/fixtures/editor-operations';
const fixtures: ReturnType<typeof editorOperationsFixture>[] = [];
const scenario = () => {
	const fixture = editorOperationsFixture();
	fixtures.push(fixture);
	return fixture;
};
afterEach(() => {
	for (const fixture of fixtures.splice(0)) fixture.dispose();
});
describe('editor clipboard operations', () => {
	it('pastes over the remembered passage after menu focus collapses selection and preserves undo', async () => {
		const f = scenario();
		f.editor.commands.setTextSelection({ from: 1, to: 6 });
		f.controller.rememberContextRange();
		f.editor.commands.setTextSelection(12);
		await f.controller.paste('raw');
		const pasted = f.controller.getPlainText();
		f.editor.commands.undo();
		expect({ pasted, undone: f.controller.getPlainText() }).toEqual({
			pasted: 'replacement world',
			undone: 'Hello world'
		});
	});
	it('keeps the document and selection when clipboard access fails', async () => {
		const f = scenario();
		f.editor.commands.setTextSelection({ from: 1, to: 6 });
		f.controller.rememberContextRange();
		f.input.failure = true;
		await f.controller.paste('formatted');
		expect({
			text: f.controller.getPlainText(),
			selection: f.adapter.selection(),
			errors: f.input.errors
		}).toEqual({
			text: 'Hello world',
			selection: { from: 1, to: 6 },
			errors: ['The clipboard could not be read']
		});
	});
	it('ignores clipboard completion after the editor is released', async () => {
		const f = scenario();
		let finish!: () => void;
		f.input.pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const paste = f.controller.paste('raw');
		f.controller.release();
		finish();
		await paste;
		expect(f.editor.getText()).toBe('Hello world');
	});
	it('copies the remembered passage without moving the current caret', async () => {
		const f = scenario();
		f.editor.commands.setTextSelection({ from: 1, to: 6 });
		f.controller.rememberContextRange();
		f.editor.commands.setTextSelection(12);
		await f.controller.copy('markdown');
		expect({
			copied: f.writer.value,
			caret: f.editor.state.selection.from,
			canCopy: f.state.view.canCopy
		}).toEqual({ copied: { kind: 'text', text: 'Hello' }, caret: 12, canCopy: true });
	});
	it('keeps cut content when the clipboard falls back to text only', async () => {
		const f = scenario();
		f.writer.fail.add('rich');
		const mayDelete = await f.clipboard.cut({
			kind: 'rich',
			html: '<strong>Hello</strong>',
			text: 'Hello'
		});
		expect({ mayDelete, copied: f.writer.value, kept: f.input.kept }).toEqual({
			mayDelete: false,
			copied: { kind: 'text', text: 'Hello' },
			kept: [false]
		});
	});
	it('does not report a programmatic replacement as an authored edit', () => {
		const f = scenario();
		f.controller.replaceDocument({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remote update' }] }]
		});
		f.editor.commands.setTextSelection(1);
		f.editor.commands.insertContent('Authored ');
		expect({ text: f.controller.getPlainText(), changes: f.changes }).toEqual({
			text: 'Authored Remote update',
			changes: 1
		});
	});
});
