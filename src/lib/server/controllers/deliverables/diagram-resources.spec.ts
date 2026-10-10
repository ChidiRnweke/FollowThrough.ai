import { expect, it } from 'vitest';
import { DiagramExportRendering } from './diagram-rendering';
import { DiagramRenderResourceStore } from '$lib/server/stores/deliverables/diagram-resources';
import { NodeDiagramRenderResources } from '$lib/server/adapters/deliverables/diagram-resources';
import { BrowserDiagramRasterizer } from '$lib/server/adapters/deliverables/diagram-rendering';
import { InMemoryDiagramRenderResources } from '$lib/testing/deliverables/fakes/diagram-resources';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import type { ExportDiagramSource } from '$lib/models/deliverables';
const source: ExportDiagramSource = {
	kind: 'svg',
	key: 'diagram',
	source:
		'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>'
};
const config = new MermaidThemeService().resolve(false).config;
const setup = async () => {
	const reader = new InMemoryDiagramRenderResources(await new NodeDiagramRenderResources().read());
	return {
		reader,
		controller: new DiagramExportRendering(
			new DiagramRenderResourceStore(),
			reader,
			new BrowserDiagramRasterizer()
		)
	};
};
it('keeps resolved assets for the process even when subsequent file access fails', async () => {
	const { reader, controller } = await setup();
	await controller.render([source], config);
	reader.failure = new Error('Assets are no longer readable');
	const rendered = await controller.render([source], config);
	expect(rendered.get('diagram')?.size).toEqual({ width: 80, height: 40 });
}, 30_000);
it('shares the outstanding asset read between concurrent exports', async () => {
	const { reader, controller } = await setup();
	let release!: () => void;
	reader.gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = controller.render([source], config);
	reader.failure = new Error('A second file read cannot succeed');
	const second = controller.render([source], config);
	release();
	const results = await Promise.all([first, second]);
	expect(results.map((result) => result.get('diagram')?.size)).toEqual([
		{ width: 80, height: 40 },
		{ width: 80, height: 40 }
	]);
}, 30_000);
it('allows retry after a resource read fails', async () => {
	const { reader, controller } = await setup();
	reader.failure = new Error('Assets unavailable');
	const failure = await controller.render([source], config).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	reader.failure = undefined;
	const rendered = await controller.render([source], config);
	expect({ failure, size: rendered.get('diagram')?.size }).toEqual({
		failure: 'A diagram could not be rendered for export',
		size: { width: 80, height: 40 }
	});
}, 30_000);
