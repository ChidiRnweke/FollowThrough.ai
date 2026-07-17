import { describe, expect, it } from 'vitest';
import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';
import { generateDocx } from './docx-generator';

const styles: ExtractedTemplateStyles = {
	fonts: {
		heading: { Heading1: { name: 'Calibri', size: 16, bold: true, italic: false } },
		body: { name: 'Calibri', size: 11 }
	},
	pageMargins: { top: 720, bottom: 720, left: 720, right: 720 },
	themeColors: {}
};

const document: ProseMirrorDocument = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
		{ type: 'paragraph', content: [{ type: 'text', text: 'Before the rule.' }] },
		{ type: 'horizontalRule' },
		{ type: 'paragraph', content: [{ type: 'text', text: 'After the rule.' }] }
	]
};

describe('Docx generation invariants', () => {
	it('produces a zip container for a document with a horizontal rule', async () => {
		const buffer = await generateDocx({
			notes: [{ title: 'Note', document }],
			styles,
			title: 'Export'
		});
		expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
	});
});
