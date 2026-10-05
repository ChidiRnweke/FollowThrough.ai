import { describe, expect, it } from 'vitest';
import type { ExtractedTemplateStyles } from '$lib/models/deliverables';
import type {
	ProseMirrorDocument,
	ProseMirrorListItemNode,
	ProseMirrorMark,
	ProseMirrorTableCellNode,
	ProseMirrorTableHeaderNode
} from '$lib/models/notes';
import { defaultExportSettings } from '$lib/models/deliverables';
import AdmZip from 'adm-zip';
import { generateDocx } from './docx';
import { prepareExport } from './export-preparation';
import type { ExportInput } from '$lib/models/deliverables';
import { mermaidSourceHash } from '$lib/server/repositories/deliverables/export-images';

type GenerateDocxArgs = ExportInput;

const renderCache = new Map<string, Promise<Buffer>>();

const memoizedGenerateDocx = (input: GenerateDocxArgs): Promise<Buffer> => {
	const key = JSON.stringify({
		notes: input.notes,
		title: input.title,
		settings: input.settings ?? defaultExportSettings,
		diagramSvgs: input.diagramSvgs,
		diagramPngs: input.diagramPngs,
		diagramSizes: input.diagramSizes,
		images: [...(input.images ?? [])],
		styles: input.styles
	});
	const cached = renderCache.get(key);
	if (cached) return cached;
	const rendered = generateDocx(prepareExport(input));
	renderCache.set(key, rendered);
	return rendered;
};

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

/**
 * Asserted against the generated `word/document.xml`, which is the only honest check for
 * this library: `docx` builds an opaque object graph, so a run that looks right in
 * TypeScript can still serialize to nothing.
 */
const documentXml = async (body: ProseMirrorDocument): Promise<string> => {
	const buffer = await memoizedGenerateDocx({
		notes: [{ title: 'Note', document: body }],
		styles,
		title: 'Export'
	});
	return new AdmZip(buffer).readAsText('word/document.xml');
};

const linked = (marks: ProseMirrorMark[]): ProseMirrorDocument => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', marks, text: 'the docs' }] }]
});

describe('Links in an exported document', () => {
	/** The URL used to be dropped entirely: the anchor text survived, the destination did not. */
	it('preserves the destination, hyperlink structure, and readable text for a link', async () => {
		const zip = await zipFor({
			notes: [
				{
					title: 'Note',
					document: linked([{ type: 'link', attrs: { href: 'https://example.com/spec' } }])
				}
			]
		});
		const rels = zip.readAsText('word/_rels/document.xml.rels');
		const xml = zip.readAsText('word/document.xml');
		expect({ destination: rels, hyperlink: xml, text: xml }).toEqual({
			destination: expect.stringContaining('https://example.com/spec'),
			hyperlink: expect.stringContaining('<w:hyperlink'),
			text: expect.stringContaining('the docs')
		});
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

	// Regression: the editor double-spaces a title from the body below it; the
	// exported document carries the same spacing (DOCX spacing is in twips).
	it('double-spaces an h1 title in the document body', async () => {
		const xml = await documentXml({
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] }
			]
		});
		expect(xml).toContain('<w:spacing w:after="360" w:before="360"/>');
	});

	it('gives an h2 title a slightly smaller double-space', async () => {
		const xml = await documentXml({
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] }
			]
		});
		expect(xml).toContain('<w:spacing w:after="300" w:before="300"/>');
	});

	it('leaves deeper headings on the Word style spacing', async () => {
		const xml = await documentXml({
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sub' }] }]
		});
		expect(xml).not.toContain('<w:spacing w:before=');
	});

	it('ignores a link mark carrying no href', async () => {
		const xml = await documentXml(linked([{ type: 'link', attrs: {} }]));
		expect(xml).not.toContain('<w:hyperlink');
	});
});

const TINY_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DRAWIO_ID = '00000000-0000-4000-8000-0000000000d1';
const DIAGRAM_SOURCE = 'flowchart LR\n  A --> B';
const DIAGRAM_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#eee"/></svg>';

const zipFor = async (overrides: Partial<ExportInput> = {}) =>
	new AdmZip(
		await memoizedGenerateDocx({
			notes: [{ title: 'Note', document }],
			title: 'Export',
			...overrides
		})
	);

/**
 * Parity with the PDF export: tables, diagrams, images, settings and nested
 * structure must survive a DOCX export just like they survive a PDF.
 */
describe('Docx export parity with PDF', () => {
	const cell = (text: string): ProseMirrorTableCellNode => ({
		type: 'tableCell',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
	const header = (text: string): ProseMirrorTableHeaderNode => ({
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
	});

	it('embeds a browser-rendered diagram as an image (1/2)', async () => {
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

	// The browser sends the viewBox as numbers and keeps its markup, so the SVG is normally
	// absent. Without the size the raster's own 1x1 pixels would drive the extent.
	it('sizes a diagram from the supplied size when no SVG was sent', async () => {
		const withDiagram: ProseMirrorDocument = {
			type: 'doc',
			content: [{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] }]
		};
		const hash = mermaidSourceHash(DIAGRAM_SOURCE);
		const zip = await zipFor({
			notes: [{ title: 'Note', document: withDiagram }],
			diagramPngs: { [hash]: TINY_PNG },
			diagramSizes: { [hash]: { width: 120, height: 60 } }
		});
		// docx converts pixels to EMU at 9525 per pixel: 120 x 60 px.
		expect(zip.readAsText('word/document.xml')).toContain('cx="1143000" cy="571500"');
	});

	it('keeps the diagram source as code when no render was supplied (1/2)', async () => {
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

	it('omits the file name from the page when includeTitle is false', async () => {
		const untitled = await memoizedGenerateDocx({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport'
		});
		expect(new AdmZip(untitled).readAsText('word/document.xml')).not.toContain(
			'ZebraQuarterlyReport'
		);
	});

	it('includes the file name in the page when includeTitle is true', async () => {
		const titled = await memoizedGenerateDocx({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport',
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		expect(new AdmZip(titled).readAsText('word/document.xml')).toContain('ZebraQuarterlyReport');
	});

	it('honours font, margin, and line-height settings when no template overrides them', async () => {
		const zip = await zipFor({
			settings: { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 }
		});
		const stylesXml = zip.readAsText('word/styles.xml');
		const xml = zip.readAsText('word/document.xml');
		// 54pt margins are 1080 twips; 1.6 line height is 384 twentieths of a line.
		expect({ font: stylesXml, margin: xml, lineHeight: xml }).toEqual({
			font: expect.stringContaining('Times New Roman'),
			margin: expect.stringContaining('w:top="1080"'),
			lineHeight: expect.stringContaining('w:line="384"')
		});
	});

	it('degrades an unreachable remote image without failing the export (1/2)', async () => {
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

	it('keeps nested lists at their own indent level (1/2)', async () => {
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

	it('preserves the link, bold mark, and indentation inside a blockquote', async () => {
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
		expect({ bold: xml, indentation: xml }).toEqual({
			bold: expect.stringContaining('<w:b/>'),
			indentation: expect.stringContaining('<w:ind w:left="720"/>')
		});
	});
});

describe('App-owned attachment images in an exported document', () => {
	const withAttachmentImage = (src: string): ProseMirrorDocument => ({
		type: 'doc',
		content: [{ type: 'image', attrs: { src } }]
	});

	it('embeds an attachment image that the image resolver resolves to a data URL', async () => {
		const zip = await zipFor({
			notes: [{ title: 'Note', document: withAttachmentImage('/api/attachments/a1/content') }],
			images: new Map([['/api/attachments/a1/content', TINY_PNG]])
		});
		expect(zip.getEntries().some((entry) => entry.entryName.startsWith('word/media/'))).toBe(true);
	});

	it('degrades an attachment image when no resolver supplies its bytes', async () => {
		const xml = (
			await zipFor({
				notes: [{ title: 'Note', document: withAttachmentImage('/api/attachments/a1/content') }]
			})
		).readAsText('word/document.xml');
		expect(xml).toContain('[image unavailable]');
	});
});

describe('Ordered-list numbering in an exported document', () => {
	const listItem = (text: string): ProseMirrorListItemNode => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

	it('restarts numbering for each separate ordered list (1/2)', async () => {
		const twoLists: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{ type: 'orderedList', content: [listItem('First')] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'between' }] },
				{ type: 'orderedList', content: [listItem('Second')] }
			]
		};
		const xml = (await zipFor({ notes: [{ title: 'Note', document: twoLists }] })).readAsText(
			'word/document.xml'
		);
		expect(
			new Set([...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((match) => match[1]!)).size
		).toBe(2);
	});

	it('gives a nested ordered list its own numbering instance (2/2)', async () => {
		const nested: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'orderedList',
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Outer' }] },
								{ type: 'orderedList', content: [listItem('Inner')] }
							]
						}
					]
				}
			]
		};
		const xml = (await zipFor({ notes: [{ title: 'Note', document: nested }] })).readAsText(
			'word/document.xml'
		);
		expect(
			new Set([...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((match) => match[1]!)).size
		).toBe(2);
	});

	// draw.io ships the SVG its editor exported; there is no readable source to fall
	// back to, so the document either embeds the picture or says it is missing.
	it('embeds a referenced draw.io diagram as an image', async () => {
		const withDrawio: ProseMirrorDocument = {
			type: 'doc',
			content: [{ type: 'drawio', attrs: { diagramId: DRAWIO_ID } }]
		} as ProseMirrorDocument;
		const zip = await zipFor({
			notes: [{ title: 'Note', document: withDrawio }],
			diagramSvgs: { [DRAWIO_ID]: DIAGRAM_SVG },
			diagramPngs: { [DRAWIO_ID]: TINY_PNG }
		});
		expect(zip.readAsText('word/document.xml')).toContain('<w:drawing>');
	});

	it('marks a draw.io diagram unavailable when nothing rendered it', async () => {
		const withDrawio: ProseMirrorDocument = {
			type: 'doc',
			content: [{ type: 'drawio', attrs: { diagramId: DRAWIO_ID } }]
		} as ProseMirrorDocument;
		const zip = await zipFor({ notes: [{ title: 'Note', document: withDrawio }] });
		expect(zip.readAsText('word/document.xml')).toContain('diagram unavailable');
	});
});
