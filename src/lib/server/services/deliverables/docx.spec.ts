import { describe, expect, it } from 'vitest';
import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';
import AdmZip from 'adm-zip';
import { generateDocx } from './docx';

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

/**
 * Asserted against the generated `word/document.xml`, which is the only honest check for
 * this library: `docx` builds an opaque object graph, so a run that looks right in
 * TypeScript can still serialize to nothing.
 */
const documentXml = async (body: ProseMirrorDocument): Promise<string> => {
	const buffer = await generateDocx({
		notes: [{ title: 'Note', document: body }],
		styles,
		title: 'Export'
	});
	return new AdmZip(buffer).readAsText('word/document.xml');
};

/**
 * An external hyperlink's target lives in the relationships part, not the document body —
 * `document.xml` only carries the `r:id` that points at it. Checking the wrong part makes
 * a working link look broken.
 */
const relationshipsXml = async (body: ProseMirrorDocument): Promise<string> => {
	const buffer = await generateDocx({
		notes: [{ title: 'Note', document: body }],
		styles,
		title: 'Export'
	});
	return new AdmZip(buffer).readAsText('word/_rels/document.xml.rels');
};

const linked = (marks: unknown[]): ProseMirrorDocument => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', marks, text: 'the docs' }] }]
});

describe('Links in an exported document', () => {
	/** The URL used to be dropped entirely: the anchor text survived, the destination did not. */
	it('keeps the URL of a link', async () => {
		const rels = await relationshipsXml(
			linked([{ type: 'link', attrs: { href: 'https://example.com/spec' } }])
		);
		expect(rels).toContain('https://example.com/spec');
	});

	it('writes the link as a hyperlink relationship, not plain text', async () => {
		const xml = await documentXml(
			linked([{ type: 'link', attrs: { href: 'https://example.com/spec' } }])
		);
		expect(xml).toContain('<w:hyperlink');
	});

	it('keeps the link text readable', async () => {
		const xml = await documentXml(
			linked([{ type: 'link', attrs: { href: 'https://example.com/spec' } }])
		);
		expect(xml).toContain('the docs');
	});

	it('keeps emphasis inside a link', async () => {
		const xml = await documentXml(
			linked([{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'bold' }])
		);
		expect(xml).toContain('<w:b/>');
	});

	it('leaves unlinked text without a hyperlink', async () => {
		const xml = await documentXml(linked([]));
		expect(xml).not.toContain('<w:hyperlink');
	});

	it('ignores a link mark carrying no href', async () => {
		const xml = await documentXml(linked([{ type: 'link', attrs: {} }]));
		expect(xml).not.toContain('<w:hyperlink');
	});
});
