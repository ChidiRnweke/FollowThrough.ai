import { expect, it } from 'vitest';
import { MermaidDiagrams } from './mermaid';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { InMemoryMermaidRenderer } from '$lib/testing/diagrams/fakes/mermaid-render';
import { InMemoryMermaidOutput } from '$lib/testing/diagrams/fakes/mermaid-output';
const setup = () => {
	const renderer = new InMemoryMermaidRenderer();
	const output = new InMemoryMermaidOutput();
	return {
		renderer,
		output,
		controller: new MermaidDiagrams(new MermaidThemeService(), renderer, output)
	};
};
it('downloads SVG without rasterizing it', async () => {
	const { renderer, output, controller } = setup();
	const pending = controller.download({
		source: 'diagram',
		theme: { base: 'light' },
		format: 'svg',
		fileName: 'Architecture'
	});
	renderer.complete('diagram', '<svg>Diagram</svg>');
	await pending;
	expect({ downloads: output.downloads, rasters: output.rasters }).toEqual({
		downloads: [{ format: 'svg', name: 'Architecture', content: '<svg>Diagram</svg>' }],
		rasters: []
	});
});
it('exports PNG at the chosen scale without a fill for transparency', async () => {
	const { renderer, output, controller } = setup();
	const pending = controller.download({
		source: 'diagram',
		theme: { base: 'dark', transparent: true },
		format: 'png',
		scale: 3
	});
	renderer.complete('diagram', '<svg>Diagram</svg>');
	await pending;
	expect({ downloads: output.downloads, rasters: output.rasters }).toEqual({
		downloads: [{ format: 'png', name: 'diagram', content: 'data:image/png;base64,cG5n' }],
		rasters: [{ svg: '<svg>Diagram</svg>', background: undefined, scale: 3 }]
	});
});
it('prepares a clipboard PNG with the chosen palette background and device scale', async () => {
	const { renderer, output, controller } = setup();
	const pending = controller.png('diagram', { base: 'dark' });
	renderer.complete('diagram', '<svg>Diagram</svg>');
	const png = await pending;
	expect({ type: png.type, text: await png.text(), rasters: output.rasters }).toEqual({
		type: 'image/png',
		text: 'png',
		rasters: [{ svg: '<svg>Diagram</svg>', background: '#0c0c09', scale: 2 }]
	});
});
it('propagates render failure without downloading a partial image', async () => {
	const { renderer, output, controller } = setup();
	const pending = controller
		.download({ source: 'invalid', theme: { base: 'light' }, format: 'png' })
		.then(
			() => 'downloaded',
			(error: Error) => error.message
		);
	renderer.fail('invalid');
	expect({ result: await pending, downloads: output.downloads, rasters: output.rasters }).toEqual({
		result: 'Invalid Mermaid',
		downloads: [],
		rasters: []
	});
});
