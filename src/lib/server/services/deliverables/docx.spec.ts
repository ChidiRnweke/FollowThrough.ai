import { describe, expect, it } from 'vitest';
import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';
import { defaultExportSettings } from '$lib/models';
import AdmZip from 'adm-zip';
import { generateDocx } from './docx';
import { mermaidSourceHash } from './export-images';

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

const TINY_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DIAGRAM_SOURCE = 'flowchart LR\n  A --> B';
const DIAGRAM_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#eee"/></svg>';

const zipFor = async (overrides: Partial<Parameters<typeof generateDocx>[0]> = {}) =>
	new AdmZip(
		await generateDocx({ notes: [{ title: 'Note', document }], title: 'Export', ...overrides })
	);

/**
 * Parity with the PDF export: tables, diagrams, images, settings and nested
 * structure must survive a DOCX export just like they survive a PDF.
 */
describe('Docx export parity with PDF', () => {
	const cell = (text: string) => ({
		type: 'tableCell',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
	const header = (text: string) => ({
		type: 'tableHeader',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

	it('renders tables as a grid, keeping cell text and spans', async () => {
		const withTable: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'table',
					content: [
						{ type: 'tableRow', content: [header('QuarterlyMetric'), header('ValueNow')] },
						{
							type: 'tableRow',
							content: [
								{ ...cell('SpanningCell'), attrs: { colspan: 2, rowspan: 1, colwidth: null } }
							]
						},
						{
							type: 'tableRow',
							content: [
								{ ...cell('TallCell'), attrs: { colspan: 1, rowspan: 2, colwidth: null } },
								cell('FortyTwo')
							]
						},
						{ type: 'tableRow', content: [cell('AfterTall')] }
					]
				}
			]
		};
		const zip = await zipFor({ notes: [{ title: 'Note', document: withTable }] });
		const xml = zip.readAsText('word/document.xml');
		expect(xml).toContain('<w:tbl>');
		for (const expected of [
			'QuarterlyMetric',
			'ValueNow',
			'SpanningCell',
			'TallCell',
			'FortyTwo',
			'AfterTall'
		]) {
			expect(xml).toContain(expected);
		}
		expect(xml).toContain('<w:gridSpan w:val="2"/>');
		expect(xml).toContain('<w:vMerge');
		expect(xml).toContain('w:fill="F3F4F6"');
	});

	it('embeds a browser-rendered diagram as an image', async () => {
		const withDiagram: ProseMirrorDocument = {
			type: 'doc',
			content: [{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] }]
		};
		const hash = mermaidSourceHash(DIAGRAM_SOURCE);
		const zip = await zipFor({
			notes: [{ title: 'Note', document: withDiagram }],
			diagramSvgs: { [hash]: DIAGRAM_SVG },
			diagramPngs: { [hash]: TINY_PNG }
		});
		expect(zip.getEntries().some((entry) => entry.entryName.startsWith('word/media/'))).toBe(true);
		expect(zip.readAsText('word/document.xml')).toContain('<w:drawing>');
	});

	it('keeps the diagram source as code when no render was supplied', async () => {
		const withDiagram: ProseMirrorDocument = {
			type: 'doc',
			content: [{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] }]
		};
		const xml = (await zipFor({ notes: [{ title: 'Note', document: withDiagram }] })).readAsText(
			'word/document.xml'
		);
		expect(xml).toContain('flowchart');
		expect(xml).toContain('Courier New');
	});

	it('omits the file name from the page unless includeTitle is set', async () => {
		const untitled = await generateDocx({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport'
		});
		expect(new AdmZip(untitled).readAsText('word/document.xml')).not.toContain(
			'ZebraQuarterlyReport'
		);

		const titled = await generateDocx({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport',
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		expect(new AdmZip(titled).readAsText('word/document.xml')).toContain('ZebraQuarterlyReport');
	});

	it('honours export settings when no template styles them', async () => {
		const zip = await zipFor({
			settings: { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 }
		});
		expect(zip.readAsText('word/styles.xml')).toContain('Times New Roman');
		const xml = zip.readAsText('word/document.xml');
		// 54pt margins are 1080 twips; 1.6 line height is 384 twentieths of a line.
		expect(xml).toContain('w:top="1080"');
		expect(xml).toContain('w:line="384"');
	});

	it('degrades an unreachable remote image without failing the export', async () => {
		const withRemoteImage: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{ type: 'image', attrs: { src: 'http://127.0.0.1:9/missing.png' } },
				{ type: 'paragraph', content: [{ type: 'text', text: 'Still here.' }] }
			]
		};
		const xml = (
			await zipFor({ notes: [{ title: 'Note', document: withRemoteImage }] })
		).readAsText('word/document.xml');
		expect(xml).toContain('[image unavailable]');
		expect(xml).toContain('Still here.');
	});

	it('keeps nested lists at their own indent level', async () => {
		const withNestedList: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Outer' }] },
								{
									type: 'bulletList',
									content: [
										{
											type: 'listItem',
											content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner' }] }]
										}
									]
								}
							]
						}
					]
				}
			]
		};
		const xml = (await zipFor({ notes: [{ title: 'Note', document: withNestedList }] })).readAsText(
			'word/document.xml'
		);
		expect(xml).toContain('Inner');
		expect(xml).toContain('<w:ilvl w:val="1"/>');
	});

	it('defines the numbering ordered lists reference', async () => {
		const withOrderedList: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'orderedList',
					content: [
						{
							type: 'listItem',
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }]
						}
					]
				}
			]
		};
		const zip = await zipFor({ notes: [{ title: 'Note', document: withOrderedList }] });
		expect(zip.readAsText('word/numbering.xml')).toContain('<w:numFmt w:val="decimal"/>');
	});

	it('keeps links and bold inside a blockquote', async () => {
		const withQuote: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'blockquote',
					content: [
						{
							type: 'paragraph',
							content: [
								{
									type: 'text',
									text: 'quoted docs',
									marks: [
										{ type: 'link', attrs: { href: 'https://example.com/quoted' } },
										{ type: 'bold' }
									]
								}
							]
						}
					]
				}
			]
		};
		const zip = await zipFor({ notes: [{ title: 'Note', document: withQuote }] });
		expect(zip.readAsText('word/_rels/document.xml.rels')).toContain('https://example.com/quoted');
		const xml = zip.readAsText('word/document.xml');
		expect(xml).toContain('<w:b/>');
		expect(xml).toContain('<w:ind w:left="720"/>');
	});
});
