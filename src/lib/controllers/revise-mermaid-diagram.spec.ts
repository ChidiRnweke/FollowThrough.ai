import { describe, expect, it } from 'vitest';
import { DefaultDiagramsController, type DiagramsDependencies } from './diagrams';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/fixtures/domain-builders';

const setup = (drawio = false) => {
	const diagrams = new InMemoryDiagrams();
	diagrams.diagrams = [drawio ? drawioBuilder() : mermaidBuilder()];
	return {
		diagrams,
		controller: new DefaultDiagramsController({
			diagramFinder: diagrams,
			mermaidReviser: diagrams,
			mermaidRenderer: diagrams,
			textExtractor: diagrams,
			diagramWriter: diagrams,
			diagramIndexer: diagrams
		} as unknown as DiagramsDependencies)
	};
};

describe('Revise Mermaid workflow invariants', () => {
	it('rejects revision of a promoted draw.io diagram', async () => {
		const { controller } = setup(true);
		await expect(
			controller.reviseMermaid(testActor(), {
				diagramId: drawioBuilder().id,
				instruction: 'change'
			})
		).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_OPERATION' });
	});

	it('persists rendered output for a Mermaid revision', async () => {
		const { controller } = setup();
		const result = await controller.reviseMermaid(testActor(), {
			diagramId: mermaidBuilder().id,
			instruction: 'add queue'
		});
		expect(result.diagram.renderedSvg).toContain('<svg>');
	});

	it('indexes the saved Mermaid revision', async () => {
		const { controller, diagrams } = setup();
		await controller.reviseMermaid(testActor(), {
			diagramId: mermaidBuilder().id,
			instruction: 'add queue'
		});
		expect(diagrams.indexedIds).toEqual([mermaidBuilder().id]);
	});
});
