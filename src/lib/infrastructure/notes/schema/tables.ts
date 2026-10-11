import { mergeAttributes, Node } from '@tiptap/core';
import {
	Table as TiptapTable,
	TableHeader as TiptapTableHeader,
	TableRow as TiptapTableRow
} from '@tiptap/extension-table';

/** Table schema for notes. The editor adds overflow tracking, grips and selection decorations. */
export const NoteTable = TiptapTable.configure({
	resizable: true,
	lastColumnResizable: true,
	allowTableNodeSelection: true
});

export const NoteTableRow = TiptapTableRow.extend({
	allowGapCursor: false,
	content: '(tableCell | tableHeader)*'
});

export interface TableCellOptions {
	// audit-allow: no-record-unknown — Tiptap's HTMLAttributes are open DOM attributes typed any by the library.
	HTMLAttributes: Record<string, unknown>;
}

export const NoteTableCell = Node.create<TableCellOptions>({
	name: 'tableCell',

	content: 'block+',
	tableRole: 'cell',

	isolating: true,

	addOptions() {
		return {
			HTMLAttributes: {}
		};
	},

	parseHTML() {
		return [{ tag: 'td' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['td', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
	},

	addAttributes() {
		return {
			colspan: {
				default: 1,
				parseHTML: (element) => {
					const colspan = element.getAttribute('colspan');
					const value = colspan ? Number.parseInt(colspan, 10) : 1;

					return value;
				}
			},
			rowspan: {
				default: 1,
				parseHTML: (element) => {
					const rowspan = element.getAttribute('rowspan');
					const value = rowspan ? Number.parseInt(rowspan, 10) : 1;

					return value;
				}
			},
			colwidth: {
				default: null,
				parseHTML: (element) => {
					const colwidth = element.getAttribute('colwidth');
					const value = colwidth ? [Number.parseInt(colwidth, 10)] : null;

					return value;
				}
			},
			style: {
				default: null
			}
		};
	}
});

export const NoteTableHeader = TiptapTableHeader.extend({
	addAttributes() {
		return {
			colspan: {
				default: 1
			},
			rowspan: {
				default: 1
			},
			colwidth: {
				default: null,
				parseHTML: (element) => {
					const colwidth = element.getAttribute('colwidth');
					const value = colwidth
						? colwidth.split(',').map((item) => Number.parseInt(item, 10))
						: null;

					return value;
				}
			},
			style: {
				default: null
			}
		};
	}
});
