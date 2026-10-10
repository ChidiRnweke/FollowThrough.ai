import { expect, it } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { editorOperationsFixture } from '$lib/testing/notes/fixtures/editor-operations';
it('collapses a table row selection onto valid text while retaining its held highlight', () => {
	const f = editorOperationsFixture();
	try {
		f.editor.commands.setContent(
			'<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>'
		);
		const cells: number[] = [];
		f.editor.state.doc.descendants((node, pos) => {
			if (node.type.name === 'tableCell') cells.push(pos);
		});
		f.editor.view.dispatch(
			f.editor.state.tr.setSelection(CellSelection.create(f.editor.state.doc, cells[0], cells[1]))
		);
		f.controller.blur(false);
		expect({
			empty: f.editor.state.selection.empty,
			inline: f.editor.state.selection.$from.parent.inlineContent,
			held: f.editor.view.dom.querySelectorAll('.selection-held').length > 0
		}).toEqual({ empty: true, inline: true, held: true });
	} finally {
		f.dispose();
	}
});
