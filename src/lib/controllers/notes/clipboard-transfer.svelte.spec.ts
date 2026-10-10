import { describe, expect, it } from 'vitest';
import { NoteClipboard, type NoteClipboardDependencies } from './clipboard-operations';
import type { ClipboardSource, ClipboardTransferReport } from '$lib/models/clipboard';
import type {
	NoteEditorPort,
	NoteEditorState,
	NoteWorkspaceEditor,
	NoteEditorEvents
} from '$lib/models/browser-workspace';
import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryClipboardInput } from '$lib/testing/notes/fakes/in-memory-clipboard-input';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { BrowserMermaidImageOutput } from '$lib/client/diagrams/mermaid-export';
import { InMemoryMermaidRenderer } from '$lib/testing/diagrams/fakes/mermaid-render';
import type { MermaidSvgRenderer } from '$lib/models/diagrams/mermaid-theme';
import { InMemoryClipboard } from '$lib/testing/notes/fakes/in-memory-clipboard';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { readClipboardImage } from '$lib/client/clipboard/images';

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
const diagramSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="green"/></svg>';
const setup = (renderer: MermaidSvgRenderer = { render: async () => diagramSvg }) => {
	const writer = new InMemoryClipboard();
	const input = new InMemoryClipboardInput();
	const editors = new WorkspaceCapabilityStore<NoteWorkspaceEditor>();
	const identity = { key: Symbol('clipboard-test') };
	let selected: ClipboardSource | undefined;
	editors.set(identity, {
		port: capabilityDependencies<NoteEditorPort>({ active: true, copySource: () => selected }),
		state: capabilityDependencies<NoteEditorState>({ active: true }),
		events: capabilityDependencies<NoteEditorEvents>({})
	});
	const transfer = new NoteClipboard(
		capabilityDependencies<NoteClipboardDependencies>({
			editors,
			writer,
			reader: input,
			feedback: input,
			document: (content) => new BrowserClipboardDocument(content),
			readImage: readClipboardImage,
			themes: new MermaidThemeService(),
			appearance: { theme: () => ({ base: 'light' }) },
			renderer,
			output: new BrowserMermaidImageOutput()
		})
	);
	const copy = async (source: ClipboardSource): Promise<ClipboardTransferReport> => {
		selected = source;
		const result = await transfer.copySelection(identity);
		if (!result) throw new Error('A selected source must produce a clipboard result');
		return result;
	};
	return { writer, copy };
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
			const { copy, writer } = setup();
			const report = await copy({ kind: 'rich', html: `<img src="${url}">`, text: '' });
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
		const { copy, writer } = setup();
		const report = await copy({
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
		const { copy, writer } = setup();
		await copy({
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
		const { copy, writer } = setup();
		const blob = await png();
		const url = URL.createObjectURL(blob);
		try {
			await copy({
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
		const { copy, writer } = setup();
		const url = URL.createObjectURL(await png());
		try {
			const report = await copy({ kind: 'image', source: url, text: 'Green square' });
			expect({
				kind: report.kind,
				type: writer.value.kind === 'image' ? writer.value.image.type : null
			}).toEqual({ kind: 'complete', type: 'image/png' });
		} finally {
			URL.revokeObjectURL(url);
		}
	});
	it('marks a failed lone image in the copied text fallback', async () => {
		const { copy, writer } = setup();
		const report = await copy({
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
		const { copy, writer } = setup();
		writer.fail.add('rich');
		const report = await copy({
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
		const { copy, writer } = setup();
		await writer.writeText('Prior clipboard');
		writer.fail.add('rich');
		writer.fail.add('text');
		const report = await copy({ kind: 'rich', html: '<p>New text</p>', text: 'New text' });
		expect({ report: report.kind, clipboard: writer.value }).toEqual({
			report: 'failure',
			clipboard: { kind: 'text', text: 'Prior clipboard' }
		});
	});
});

it('starts the native image write before a diagram finishes rendering', async () => {
	const renderer = new InMemoryMermaidRenderer();
	const f = setup(renderer);
	const copying = f.copy({ kind: 'diagram', source: 'graph TD; A-->B', text: 'Diagram' });
	f.writer.activation = false;
	renderer.complete('graph TD; A-->B', diagramSvg);
	const result = await copying;
	expect({
		result: result.kind,
		type: f.writer.value.kind === 'image' ? f.writer.value.image.type : ''
	}).toEqual({ result: 'complete', type: 'image/png' });
});
it('starts the native rich write before embedded diagrams finish rendering', async () => {
	const renderer = new InMemoryMermaidRenderer();
	const f = setup(renderer);
	const copying = f.copy({
		kind: 'rich',
		html: '<div data-type="mermaid">graph TD; A--&gt;B</div>',
		text: 'Diagram'
	});
	f.writer.activation = false;
	renderer.complete('graph TD; A-->B', diagramSvg);
	const result = await copying;
	expect({ result: result.kind }).toEqual({
		result: 'complete'
	});
});
it('marks a failed diagram visibly and reports the degraded copy', async () => {
	const renderer = new InMemoryMermaidRenderer();
	const f = setup(renderer);
	const copying = f.copy({
		kind: 'rich',
		html: '<div data-type="mermaid">invalid</div>',
		text: 'Diagram'
	});
	renderer.fail('invalid');
	const result = await copying;
	expect({
		result: result.kind,
		text: f.writer.value.kind === 'rich' ? f.writer.value.content.text : ''
	}).toEqual({ result: 'degraded', text: 'Diagram\n[Diagram unavailable]' });
});
