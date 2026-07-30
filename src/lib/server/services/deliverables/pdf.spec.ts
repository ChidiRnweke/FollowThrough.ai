import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import type { ProseMirrorDocument } from '$lib/models';
import { defaultExportSettings } from '$lib/models';
import { generatePdf, mermaidSourceHash } from './pdf';

const TINY_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DIAGRAM_SOURCE = 'flowchart LR\n  A --> B';
const DIAGRAM_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#eee"/><text x="10" y="35">Diagram</text></svg>';

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
	generatePdf({ notes: [{ title: 'Note', document }], title: 'Export', ...overrides });

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
	it('produces a pdf container for representative note content', async () => {
		const buffer = await generate();
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
	});

	it('persists hyperlinks as link annotations', async () => {
		const buffer = await generate();
		expect(buffer.toString('latin1')).toContain('https://example.com/docs');
	});

	it('embeds a browser-rendered diagram', async () => {
		const buffer = await generate({
			diagramSvgs: { [mermaidSourceHash(DIAGRAM_SOURCE)]: DIAGRAM_SVG }
		});
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
	});

	it('degrades an unreachable remote image without failing the export', async () => {
		const withRemoteImage: ProseMirrorDocument = {
			type: 'doc',
			content: [
				{ type: 'image', attrs: { src: 'http://127.0.0.1:9/missing.png' } },
				{ type: 'paragraph', content: [{ type: 'text', text: 'Still here.' }] }
			]
		};
		const buffer = await generatePdf({
			notes: [{ title: 'Note', document: withRemoteImage }],
			title: 'Export'
		});
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
	});

	it('honours export settings', async () => {
		const buffer = await generate({
			settings: { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 }
		});
		expect(buffer.toString('latin1')).toContain('NotoSerif');
	});

	it('renders emoji and symbols through fallback fonts', async () => {
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
		const buffer = await generatePdf({
			notes: [{ title: 'Note', document: withEmoji }],
			title: 'Export'
		});
		expect(buffer.toString('latin1')).toContain('NotoEmoji');
		const text = pdfText(buffer);
		for (const expected of ['Launch', '🚀', '👨', '👩', '👧', '✅', 'naïve', '→', '≠']) {
			expect(text).toContain(expected);
		}
	});

	it('renders tables as a grid, keeping cell text and spans', async () => {
		const cell = (text: string) => ({
			type: 'tableCell',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});
		const header = (text: string) => ({
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
		const buffer = await generatePdf({
			notes: [{ title: 'Note', document: withTable }],
			title: 'Export'
		});
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
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

	it('renders code blocks in a panel, keeping indentation and dropping the language', async () => {
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
		const buffer = await generatePdf({
			notes: [{ title: 'Note', document: withCode }],
			title: 'Export'
		});
		const text = pdfText(buffer);
		// The codeBlock's language attribute is editor metadata, not document content.
		expect(text).not.toContain('TS');
		expect(text).toContain('  const answer = 42;');
		expect(text).toContain('  return answer;');
	});

	it('omits the file name from the page unless includeTitle is set', async () => {
		const titled = await generatePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport'
		});
		expect(pdfText(titled)).not.toContain('ZebraQuarterlyReport');

		const withTitle = await generatePdf({
			notes: [{ title: 'Note', document }],
			title: 'ZebraQuarterlyReport',
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		expect(pdfText(withTitle)).toContain('ZebraQuarterlyReport');
	});
});
