import { describe, expect, it } from 'vitest';
import type { ProseMirrorDocument } from '$lib/models';
import { generatePdf, mermaidSourceHash } from './pdf-generator';

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
		expect(buffer.toString('latin1')).toContain('Times-Roman');
	});
});
