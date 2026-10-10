import { expect, it } from 'vitest';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	InMemoryDiagrams,
	drawioBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
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
const preview = { projectId: testProjectId(), noteIds: [testNoteId()], title: 'Diagram' };
const setup = async () => {
	const reader = new InMemoryDiagramRenderResources(await new NodeDiagramRenderResources().read());
	const diagrams = new InMemoryDiagrams();
	const diagram = drawioBuilder({ renderedSvg: source.source });
	diagrams.diagrams = [diagram];
	const fixture = exportControllerFixture({
		diagramReader: diagrams,
		mermaidThemes: new MermaidThemeService(),
		diagramRenderer: {
			state: new DiagramRenderResourceStore(),
			reader,
			renderer: new BrowserDiagramRasterizer()
		},
		pdfGenerator: async (input) =>
			Buffer.from(JSON.stringify([...input.diagrams.values()].map((diagram) => diagram.size)))
	});
	fixture.notes.notes = [
		noteBuilder({
			document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: diagram.id } }] }
		})
	];
	return { reader, controller: fixture.service };
};
it('keeps resolved assets for the process even when subsequent file access fails', async () => {
	const { reader, controller } = await setup();
	await controller.previewDocument(testActor(), preview);
	reader.failure = new Error('Assets are no longer readable');
	const rendered = await controller.previewDocument(testActor(), preview);
	expect(JSON.parse(Buffer.from(rendered.data, 'base64').toString())[0]).toEqual({
		width: 80,
		height: 40
	});
}, 30_000);
it('shares the outstanding asset read between concurrent exports', async () => {
	const { reader, controller } = await setup();
	let release!: () => void;
	reader.gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = controller.previewDocument(testActor(), preview);
	await reader.started.promise;
	reader.failure = new Error('A second file read cannot succeed');
	const second = controller.previewDocument(testActor(), preview);
	release();
	const results = await Promise.all([first, second]);
	expect(
		results.map((result) => JSON.parse(Buffer.from(result.data, 'base64').toString())[0])
	).toEqual([
		{ width: 80, height: 40 },
		{ width: 80, height: 40 }
	]);
}, 30_000);
it('allows retry after a resource read fails', async () => {
	const { reader, controller } = await setup();
	reader.failure = new Error('Assets unavailable');
	const failure = await controller.previewDocument(testActor(), preview).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	reader.failure = undefined;
	const rendered = await controller.previewDocument(testActor(), preview);
	expect({ failure, size: JSON.parse(Buffer.from(rendered.data, 'base64').toString())[0] }).toEqual(
		{
			failure: 'A diagram could not be rendered for export',
			size: { width: 80, height: 40 }
		}
	);
}, 30_000);
