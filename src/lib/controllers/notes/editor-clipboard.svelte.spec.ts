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
		await f.clipboard.paste(f.identity, 'raw');
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
		await f.clipboard.paste(f.identity, 'formatted');
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
		const paste = f.clipboard.paste(f.identity, 'raw');
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
		await f.clipboard.copy(f.identity, 'markdown');
		expect({
			copied: f.writer.value,
			caret: f.editor.state.selection.from,
			canCopy: f.state.view.canCopy
		}).toEqual({ copied: { kind: 'text', text: 'Hello' }, caret: 12, canCopy: true });
	});
	it('keeps cut content when the clipboard falls back to text only', async () => {
		const f = scenario();
		f.writer.fail.add('rich');
		f.editor.commands.setTextSelection({ from: 1, to: 6 });
		await f.clipboard.cut(f.identity);
		expect({ text: f.editor.getText(), copied: f.writer.value, kept: f.input.kept }).toEqual({
			text: 'Hello world',
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

it('does not paste into a document replaced while the clipboard read is pending', async () => {
	const f = scenario();
	let finish!: () => void;
	f.input.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const paste = f.clipboard.paste(f.identity, 'raw');
	f.controller.replaceDocument({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Replacement document' }] }]
	});
	finish();
	await paste;
	expect(f.editor.getText()).toBe('Replacement document');
});
it('keeps a late paste tied to its original mount when the note is reopened', async () => {
	const original = scenario();
	const replacement = scenario();
	let finish!: () => void;
	original.input.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const paste = original.clipboard.paste(original.identity, 'raw');
	original.controller.release();
	original.editors.set(replacement.identity, replacement.editors.get(replacement.identity));
	finish();
	await paste;
	expect({
		original: original.editor.getText(),
		replacement: replacement.editor.getText()
	}).toEqual({ original: 'Hello world', replacement: 'Hello world' });
});
it('keeps clipboard state independent between two mounted panes', async () => {
	const first = scenario();
	const second = scenario();
	first.editors.set(second.identity, second.editors.get(second.identity));
	first.editor.commands.setTextSelection({ from: 1, to: 6 });
	first.controller.rememberContextRange();
	second.editor.commands.setTextSelection({ from: 7, to: 12 });
	second.controller.rememberContextRange();
	await first.clipboard.paste(first.identity, 'raw');
	expect({
		first: first.editor.getText(),
		second: second.editor.getText(),
		range: second.state.contextRange
	}).toEqual({ first: 'replacement world', second: 'Hello world', range: { from: 7, to: 12 } });
});
it('preserves the initialized document through an immediate paste undo and redo', async () => {
	const f = scenario();
	f.editor.commands.setTextSelection({ from: 1, to: 6 });
	f.controller.rememberContextRange();
	await f.clipboard.paste(f.identity, 'raw');
	f.editor.commands.undo();
	const undone = f.editor.getText();
	f.editor.commands.redo();
	expect({ undone, redone: f.editor.getText() }).toEqual({
		undone: 'Hello world',
		redone: 'replacement world'
	});
});
it('keyboard copy uses the live selection instead of the last context-menu range', async () => {
	const f = scenario();
	f.editor.commands.setTextSelection({ from: 1, to: 6 });
	f.controller.rememberContextRange();
	f.editor.commands.setTextSelection({ from: 7, to: 12 });
	await f.clipboard.copySelection(f.identity);
	expect(f.writer.value.kind === 'rich' ? f.writer.value.content.text : '').toBe('world');
});
it('keeps cut content after its editor is released during the write', async () => {
	const f = scenario();
	f.editor.commands.setTextSelection({ from: 1, to: 6 });
	let finish!: () => void;
	f.writer.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const cut = f.clipboard.cut(f.identity);
	f.controller.release();
	finish();
	await cut;
	expect(f.editor.getText()).toBe('Hello world');
});
it('deletes the original cut range after an intervening edit has been undone', async () => {
	const f = scenario();
	f.editor.commands.setTextSelection({ from: 1, to: 6 });
	let finish!: () => void;
	f.writer.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const cut = f.clipboard.cut(f.identity);
	f.editor.commands.insertContent('Changed');
	f.editor.commands.undo();
	finish();
	await cut;
	expect(f.editor.getText()).toBe(' world');
});
it('preserves content when a destroyed editor finishes reading the clipboard', async () => {
	const f = scenario();
	let finish!: () => void;
	f.input.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const paste = f.clipboard.paste(f.identity, 'formatted');
	f.editor.destroy();
	finish();
	const result = await paste;
	expect({ result, errors: f.input.errors }).toEqual({ result: undefined, errors: [] });
});
