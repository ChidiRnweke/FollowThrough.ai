import { afterEach, describe, expect, it } from 'vitest';
import type { Node } from '@tiptap/pm/model';
import { commands } from './commands';
import { createEditor } from './editor';
import type { Editor } from './CoreEditor';
import {
	deleteColumnOrTable,
	deleteRowOrTable,
	isRowGripSelected,
	isRowSelected,
	moveRowDown,
	moveRowUp,
	selectColumn,
	selectRow
} from './utils';

const mounted: { element: HTMLElement; dispose: () => void }[] = [];

/** Rows of cell texts; the first row is a header row when `header` is set. */
const mount = (rows: readonly (readonly string[])[], header = false): Editor => {
	const element = document.createElement('div');
	document.body.appendChild(element);
	let created: Editor | undefined;
	const dispose = $effect.root(() => {
		created = createEditor({});
	});
	if (!created) throw new Error('Editor was not created');
	const editor = created;
	editor.setOptions({ element });
	editor.commands.setContent({
		type: 'doc',
		content: [
			{
				type: 'table',
				content: rows.map((cells, index) => ({
					type: 'tableRow',
					content: cells.map((text) => ({
						type: header && index === 0 ? 'tableHeader' : 'tableCell',
						content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
					}))
				}))
			}
		]
	});
	// Into the first cell, where the grips and table commands can find the table.
	editor.commands.setTextSelection(4);
	mounted.push({ element, dispose });
	return editor;
};

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.dispose();
		entry.element.remove();
	}
});

const tables = (editor: Editor): Node[] => {
	const found: Node[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === 'table') found.push(node);
	});
	return found;
};

const rowTexts = (editor: Editor): string[][] =>
	tables(editor)[0].content.content.map((row) =>
		row.content.content.map((cell) => cell.textContent)
	);

const select = (editor: Editor, apply: typeof selectRow, index: number) =>
	editor.view.dispatch(apply(index)(editor.state.tr));

const grid = [
	['a', 'b'],
	['long content', 'c'],
	['d', 'e']
] as const;

describe('deleting table rows and columns', () => {
	it('removes the selected row', () => {
		const editor = mount(grid);
		select(editor, selectRow, 1);
		deleteRowOrTable(editor);
		expect(rowTexts(editor)).toEqual([
			['a', 'b'],
			['d', 'e']
		]);
	});

	it('removes the table with its last row', () => {
		const editor = mount([['a', 'b']]);
		select(editor, selectRow, 0);
		deleteRowOrTable(editor);
		expect(tables(editor)).toHaveLength(0);
	});

	it('removes the table with its last column', () => {
		const editor = mount([['a'], ['b']]);
		select(editor, selectColumn, 0);
		deleteColumnOrTable(editor);
		expect(tables(editor)).toHaveLength(0);
	});

	// Selecting the only row selects the whole table, which used to hide the row menu.
	it('offers the row menu for the only row of a table', () => {
		const editor = mount([['a', 'b']]);
		select(editor, selectRow, 0);
		const { state, view } = editor;
		expect(isRowGripSelected({ editor, view, state, from: state.selection.from })).toBe(true);
	});
});

describe('moving table rows', () => {
	it('swaps the content of neighbouring rows of different lengths', () => {
		const editor = mount(grid);
		select(editor, selectRow, 0);
		editor.view.dispatch(moveRowDown(editor.state.tr));
		expect(rowTexts(editor)).toEqual([
			['long content', 'c'],
			['a', 'b'],
			['d', 'e']
		]);
	});

	it('keeps the header row a header row when a row moves into it', () => {
		const editor = mount(grid, true);
		select(editor, selectRow, 1);
		editor.view.dispatch(moveRowUp(editor.state.tr));
		const header = tables(editor)[0].firstChild!.content.content.map((cell) => cell.type.name);
		expect(header).toEqual(['tableHeader', 'tableHeader']);
	});

	it('keeps the moved row selected where it lands', () => {
		const editor = mount(grid);
		select(editor, selectRow, 1);
		editor.view.dispatch(moveRowUp(editor.state.tr));
		expect(isRowSelected(0)(editor.state.selection)).toBe(true);
	});
});

describe('the toolbar table button', () => {
	it('leaves the table alone when deleting it is cancelled', () => {
		const editor = mount(grid);
		const original = window.confirm;
		window.confirm = () => false;
		try {
			commands.table[0].onClick!(editor);
		} finally {
			window.confirm = original;
		}
		expect(tables(editor)).toHaveLength(1);
	});
});
