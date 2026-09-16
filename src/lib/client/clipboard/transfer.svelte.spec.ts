import { describe, expect, it } from 'vitest';
import { ClipboardTransfer } from '$lib/controllers/notes/clipboard';
import { InMemoryClipboard } from '$lib/testing/notes/fakes/in-memory-clipboard';
import { BrowserClipboardDocument } from './document';
import { readClipboardImage } from './images';

const png = async (): Promise<Blob> => {
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 4;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is required');
	context.fillStyle = 'green';
	context.fillRect(0, 0, 4, 4);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
			'image/png'
		)
	);
};
const setup = () => {
	const writer = new InMemoryClipboard();
	const transfer = new ClipboardTransfer({
		writer,
		document: (content) => new BrowserClipboardDocument(content),
		readImage: readClipboardImage,
		renderDiagram: png
	});
	return { writer, transfer };
};

describe('portable clipboard preparation', () => {
	it('embeds a valid PNG larger than the former 12 MiB ceiling', async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 2304;
		canvas.height = 2304;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is required');
		const pixels = context.createImageData(canvas.width, canvas.height);
		for (let offset = 0; offset < pixels.data.length; offset += 65536)
			crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
		context.putImageData(pixels, 0, 0);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))),
				'image/png'
			)
		);
		if (blob.size <= 12 * 1024 * 1024)
			throw new Error('Fixture must exceed the former byte ceiling');
		const url = URL.createObjectURL(blob);
		try {
			const { transfer, writer } = setup();
			const report = await transfer.copy({ kind: 'rich', html: `<img src="${url}">`, text: '' });
			expect({
				report: report.kind,
				embedded:
					writer.value.kind === 'rich' &&
					writer.value.content.html.startsWith('<img src="data:image/png;base64,')
			}).toEqual({ report: 'complete', embedded: true });
		} finally {
			URL.revokeObjectURL(url);
		}
	});
	it('marks an unavailable authenticated image instead of copying its private URL', async () => {
		const { transfer, writer } = setup();
		const report = await transfer.copy({
			kind: 'rich',
			html: '<p>Before</p><img src="/api/attachments/clipboard-missing/content"><p>After</p>',
			text: 'Before\nAfter'
		});
		expect({
			report: report.kind,
			content: writer.value.kind === 'rich' ? writer.value.content : null
		}).toEqual({
			report: 'degraded',
			content: {
				html: '<p>Before</p><span>[Image unavailable]</span><p>After</p>',
				text: 'Before\nAfter\n[Image unavailable]'
			}
		});
	});
	it('embeds every diagram beyond the former 24-diagram ceiling', async () => {
		const { transfer, writer } = setup();
		await transfer.copy({
			kind: 'rich',
			html: '<div data-type="mermaid">graph TD; A--&gt;B</div>'.repeat(25),
			text: 'Twenty-five diagrams'
		});
		const container = document.createElement('div');
		if (writer.value.kind !== 'rich') throw new Error('Expected formatted clipboard content');
		container.innerHTML = writer.value.content.html;
		expect(
			[...container.querySelectorAll('img')].filter((image) =>
				image.src.startsWith('data:image/png')
			).length
		).toBe(25);
	});
	it('validates and embeds an image supplied as a temporary blob URL', async () => {
		const { transfer, writer } = setup();
		const blob = await png();
		const url = URL.createObjectURL(blob);
		try {
			await transfer.copy({
				kind: 'rich',
				html: `<p>Picture</p><img src="${url}" alt="Green square">`,
				text: 'Picture'
			});
			expect(writer.value.kind === 'rich' ? writer.value.content.html : '').toMatch(
				/<img src="data:image\/png;base64,[^"]+" alt="Green square">/
			);
		} finally {
			URL.revokeObjectURL(url);
		}
	});
	it('copies a lone image as a PNG', async () => {
		const { transfer, writer } = setup();
		const url = URL.createObjectURL(await png());
		try {
			const report = await transfer.copy({ kind: 'image', source: url, text: 'Green square' });
			expect({
				kind: report.kind,
				type: writer.value.kind === 'image' ? writer.value.image.type : null
			}).toEqual({ kind: 'complete', type: 'image/png' });
		} finally {
			URL.revokeObjectURL(url);
		}
	});
	it('marks a failed lone image in the copied text fallback', async () => {
		const { transfer, writer } = setup();
		const report = await transfer.copy({
			kind: 'image',
			source: '/api/attachments/clipboard-missing/content',
			text: ''
		});
		expect({ report: report.kind, clipboard: writer.value }).toEqual({
			report: 'degraded',
			clipboard: { kind: 'text', text: '[Image unavailable]' }
		});
	});
	it('reports text-only degradation when formatted writes are unavailable', async () => {
		const { transfer, writer } = setup();
		writer.fail.add('rich');
		const report = await transfer.copy({
			kind: 'rich',
			html: '<b>Keep this text</b>',
			text: 'Keep this text'
		});
		expect({ report: report.kind, clipboard: writer.value }).toEqual({
			report: 'degraded',
			clipboard: { kind: 'text', text: 'Keep this text' }
		});
	});
	it('reports total failure without replacing the prior clipboard when every write is denied', async () => {
		const { transfer, writer } = setup();
		await writer.writeText('Prior clipboard');
		writer.fail.add('rich');
		writer.fail.add('text');
		const report = await transfer.copy({ kind: 'rich', html: '<p>New text</p>', text: 'New text' });
		expect({ report: report.kind, clipboard: writer.value }).toEqual({
			report: 'failure',
			clipboard: { kind: 'text', text: 'Prior clipboard' }
		});
	});
});
