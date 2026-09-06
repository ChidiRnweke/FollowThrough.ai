import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import type {
	ProseMirrorDocument,
	ProseMirrorTableCellNode,
	ProseMirrorTableHeaderNode
} from '$lib/models/notes';
import { defaultExportSettings } from '$lib/models/deliverables';
import { generatePdf, mermaidSourceHash } from './pdf';

type GeneratePdfArgs = Parameters<typeof generatePdf>[0];

const renderCache = new Map<string, Promise<Buffer>>();

const memoizedGeneratePdf = (input: GeneratePdfArgs): Promise<Buffer> => {
	const key = JSON.stringify({
		notes: input.notes,
		title: input.title,
		settings: input.settings ?? defaultExportSettings,
		diagramSvgs: input.diagramSvgs,
		diagramPngs: input.diagramPngs,
		diagramSizes: input.diagramSizes
	});
	const cached = renderCache.get(key);
	if (cached) return cached;
	const rendered = generatePdf(input);
	renderCache.set(key, rendered);
	return rendered;
};

const TINY_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DIAGRAM_SOURCE = 'flowchart LR\n  A --> B';
const DIAGRAM_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#eee"/><text x="10" y="35">Diagram</text></svg>';

const SECOND_DIAGRAM_SOURCE = 'flowchart LR\n  C --> D';

/**
 * Two diagrams far wider than the content box: the old export promoted them to
 * emulated landscape pages, which blanked the pages around them and swallowed
 * the second diagram.
 */
const TWO_DIAGRAM_DOCUMENT: ProseMirrorDocument = {
	type: 'doc',
	content: [
		{ type: 'paragraph', content: [{ type: 'text', text: 'Before the diagrams.' }] },
		{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] },
		{ type: 'mermaid', content: [{ type: 'text', text: SECOND_DIAGRAM_SOURCE }] },
		{ type: 'paragraph', content: [{ type: 'text', text: 'After the diagrams.' }] }
	]
};

const document: ProseMirrorDocument = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'Read the ' },
				{
					type: 'text',
					text: 'docs',
					marks: [{ type: 'link', attrs: { href: 'https://example.com/docs' } }]
				}
			]
		},
		{ type: 'image', attrs: { src: TINY_PNG, width: '50%' } },
		{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] },
		{ type: 'horizontalRule' },
		{ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] }
	]
};

const generate = (overrides: Partial<Parameters<typeof generatePdf>[0]> = {}) =>
	memoizedGeneratePdf({ notes: [{ title: 'Note', document }], title: 'Export', ...overrides });

/**
 * Embedded TTFs are subsetted: page content streams hold font-local glyph IDs,
 * and each font's ToUnicode CMap (a flate-compressed stream of bfrange arrays)
 * maps them back to Unicode. Decode every glyph run through every CMap and
 * keep the union — the right CMap always yields the real text.
 */
function utf16be(hex: string): string {
	const bytes = Buffer.from(hex.replaceAll(' ', ''), 'hex');
	for (let i = 0; i + 1 < bytes.length; i += 2) {
		const swap = bytes[i]!;
		bytes[i] = bytes[i + 1]!;
		bytes[i + 1] = swap;
	}
	return bytes.toString('utf16le');
}

function parseCMap(stream: string): Map<number, string> {
	const map = new Map<number, string>();
	for (const range of stream.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
		const start = Number.parseInt(range[1]!, 16);
		const values = [...range[3]!.matchAll(/<([0-9a-fA-F ]+)>/g)].map((value) => utf16be(value[1]!));
		values.forEach((value, index) => map.set(start + index, value));
	}
	return map;
}

function pdfText(buffer: Buffer): string {
	const latin1 = buffer.toString('latin1');
	const streams = [...latin1.matchAll(/stream(?:\r\n|\n|\r)([\s\S]*?)endstream/g)].map((match) => {
		try {
			return inflateSync(Buffer.from(match[1]!.replace(/(?:\r\n|\n|\r)$/, ''), 'latin1')).toString(
				'latin1'
			);
		} catch {
			return '';
		}
	});
	const cmaps = streams.filter((stream) => stream.includes('begincmap')).map(parseCMap);
	const content = streams.filter((stream) => stream && !stream.includes('begincmap')).join('');
	const glyphRuns = [...content.matchAll(/<([0-9a-fA-F]+)>/g)].map((match) => match[1]!);
	return cmaps
		.map((cmap) =>
			glyphRuns
				.map((run) => {
					let text = '';
					for (let i = 0; i + 4 <= run.length; i += 4) {
						text += cmap.get(Number.parseInt(run.slice(i, i + 4), 16)) ?? '';
					}
					return text;
				})
				.join('')
		)
		.join('\n');
}

describe('Pdf generation invariants', () => {
	it('persists hyperlinks as link annotations', async () => {
		const buffer = await generate();
		expect(buffer.toString('latin1')).toContain('https://example.com/docs');
	});

	it('prefers the PNG raster of a diagram over its SVG', async () => {
		const hash = mermaidSourceHash(DIAGRAM_SOURCE);
		const buffer = await generate({
			diagramSvgs: { [hash]: DIAGRAM_SVG },
			diagramPngs: { [hash]: TINY_PNG }
		});
		// The PNG's IDAT bytes land in the PDF; an SVG render would carry path operators
		// for the diagram's <rect> instead.
		expect(buffer.toString('latin1')).toContain('/Image');
	});

	it('renders a diagram nested inside a list item', async () => {
		// The editor happily nests a mermaid block inside a list item; the list case
		// used to wrap every converted child into a text run, where pdfmake silently
		// drops non-text blocks — the diagram vanished from the PDF.
		const withNestedDiagram: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Concepts:' }] },
								{ type: 'mermaid', content: [{ type: 'text', text: DIAGRAM_SOURCE }] }
							]
						}
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withNestedDiagram }],
			title: 'Export',
			diagramPngs: { [mermaidSourceHash(DIAGRAM_SOURCE)]: TINY_PNG }
		});
		const placed = buffer.toString('latin1').match(/\/Subtype \/Image/g) ?? [];
		expect(placed.length).toBeGreaterThanOrEqual(1);
	});

	it('renders both large diagrams inline, placing both (1/4)', async () => {
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: TWO_DIAGRAM_DOCUMENT }],
			title: 'Export',
			diagramPngs: {
				[mermaidSourceHash(DIAGRAM_SOURCE)]: TINY_PNG,
				[mermaidSourceHash(SECOND_DIAGRAM_SOURCE)]: TINY_PNG
			}
		});
		// Both diagrams must actually be placed: pdfmake only embeds an image XObject
		// when it draws it onto a page.
		const placed = buffer.toString('latin1').match(/\/Subtype \/Image/g) ?? [];
		expect(placed.length).toBeGreaterThanOrEqual(2);
	});

	it('renders both large diagrams inline, placing both (2/4)', async () => {
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: TWO_DIAGRAM_DOCUMENT }],
			title: 'Export',
			diagramPngs: {
				[mermaidSourceHash(DIAGRAM_SOURCE)]: TINY_PNG,
				[mermaidSourceHash(SECOND_DIAGRAM_SOURCE)]: TINY_PNG
			}
		});
		// A landscape A4 MediaBox would be the portrait box swapped.
		expect(buffer.toString('latin1')).not.toContain('841.89 595.28');
	});

	it('renders both large diagrams inline, placing both (3/4)', async () => {
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: TWO_DIAGRAM_DOCUMENT }],
			title: 'Export',
			diagramPngs: {
				[mermaidSourceHash(DIAGRAM_SOURCE)]: TINY_PNG,
				[mermaidSourceHash(SECOND_DIAGRAM_SOURCE)]: TINY_PNG
			}
		});
		const text = pdfText(buffer);
		expect(text).toContain('Before the diagrams.');
	});

	it('renders both large diagrams inline, placing both (4/4)', async () => {
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: TWO_DIAGRAM_DOCUMENT }],
			title: 'Export',
			diagramPngs: {
				[mermaidSourceHash(DIAGRAM_SOURCE)]: TINY_PNG,
				[mermaidSourceHash(SECOND_DIAGRAM_SOURCE)]: TINY_PNG
			}
		});
		const text = pdfText(buffer);
		expect(text).toContain('After the diagrams.');
	});

	it('honours export settings', async () => {
		const buffer = await generate({
			settings: { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 }
		});
		expect(buffer.toString('latin1')).toContain('NotoSerif');
	});

	it('renders emoji and symbols through fallback fonts (1/2)', async () => {
		const withEmoji: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Launch 🚀 update' }]
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Family 👨‍👩‍👧 done ✅ naïve → and ≠' }]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withEmoji }],
			title: 'Export'
		});
		expect(buffer.toString('latin1')).toContain('NotoEmoji');
		const _text = pdfText(buffer);
	});

	it('renders emoji and symbols through fallback fonts (2/2)', async () => {
		const withEmoji: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Launch 🚀 update' }]
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Family 👨‍👩‍👧 done ✅ naïve → and ≠' }]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withEmoji }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		for (const expected of ['Launch', '🚀', '👨', '👩', '👧', '✅', 'naïve', '→', '≠']) {
			expect(text).toContain(expected);
		}
	});

	it('renders tables as a grid, keeping cell text and spans (1/2)', async () => {
		const cell = (text: string): ProseMirrorTableCellNode => ({
			type: 'tableCell',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});
		const header = (text: string): ProseMirrorTableHeaderNode => ({
			type: 'tableHeader',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});
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
						{ type: 'tableRow', content: [cell('RevenueUp'), cell('FortyTwo')] }
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withTable }],
			title: 'Export'
		});
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		const _text = pdfText(buffer);
	});

	it('renders tables as a grid, keeping cell text and spans (2/2)', async () => {
		const cell = (text: string): ProseMirrorTableCellNode => ({
			type: 'tableCell',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});
		const header = (text: string): ProseMirrorTableHeaderNode => ({
			type: 'tableHeader',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});
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
						{ type: 'tableRow', content: [cell('RevenueUp'), cell('FortyTwo')] }
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withTable }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		for (const expected of [
			'QuarterlyMetric',
			'ValueNow',
			'SpanningCell',
			'RevenueUp',
			'FortyTwo'
		]) {
			expect(text).toContain(expected);
		}
	});

	it('renders code blocks in a panel, keeping indentation and dropping the language (1/3)', async () => {
		const withCode: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'codeBlock',
					attrs: { language: 'ts' },
					content: [
						{
							type: 'text',
							text: 'function answer() {\n  const answer = 42;\n  return answer;\n}'
						}
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withCode }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		// The codeBlock's language attribute is editor metadata, not document content.
		expect(text).not.toContain('TS');
	});

	it('renders code blocks in a panel, keeping indentation and dropping the language (2/3)', async () => {
		const withCode: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'codeBlock',
					attrs: { language: 'ts' },
					content: [
						{
							type: 'text',
							text: 'function answer() {\n  const answer = 42;\n  return answer;\n}'
						}
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withCode }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		expect(text).toContain('  const answer = 42;');
	});

	it('renders code blocks in a panel, keeping indentation and dropping the language (3/3)', async () => {
		const withCode: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{
					type: 'codeBlock',
					attrs: { language: 'ts' },
					content: [
						{
							type: 'text',
							text: 'function answer() {\n  const answer = 42;\n  return answer;\n}'
						}
					]
				}
			]
		};
		const buffer = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document: withCode }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		expect(text).toContain('  return answer;');
	});

	it('omits the file name from the page unless includeTitle is set (1/2)', async () => {
		const titled = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport'
		});
		expect(pdfText(titled)).not.toContain('ZebraQuarterlyReport');

		const _withTitle = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport',
			settings: { ...defaultExportSettings, includeTitle: true }
		});
	});

	it('omits the file name from the page unless includeTitle is set (2/2)', async () => {
		const _titled = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport'
		});

		const withTitle = await memoizedGeneratePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport',
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		expect(pdfText(withTitle)).toContain('ZebraQuarterlyReport');
	});
});
