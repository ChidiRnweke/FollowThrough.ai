import { describe, expect, it } from 'vitest';
import { DefaultDiagramsController, type DiagramsDependencies } from './controller';
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
			drawioCreator: diagrams,
			drawioExporter: diagrams,
			diagramPromoter: diagrams,
			textExtractor: diagrams,
			diagramWriter: diagrams,
			diagramIndexer: diagrams
		} as unknown as DiagramsDependencies)
	};
};

describe('Promote diagram workflow invariants', () => {
	it('rejects promotion of an existing draw.io diagram', async () => {
		const { controller } = setup(true);
		await expect(
			controller.promote(testActor(), { diagramId: drawioBuilder().id })
		).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_OPERATION' });
	});

	it('preserves the source Mermaid link on the promoted diagram', async () => {
		const { controller } = setup();
		const result = await controller.promote(testActor(), { diagramId: mermaidBuilder().id });
		expect(result.promoted.promotedFromId).toBe(mermaidBuilder().id);
	});

	it('persists rendered SVG for the promoted diagram', async () => {
		const { controller } = setup();
		const result = await controller.promote(testActor(), { diagramId: mermaidBuilder().id });
		expect(result.promoted.renderedSvg).toContain('<svg>');
	});

	it('indexes the promoted diagram', async () => {
		const { controller, diagrams } = setup();
		const result = await controller.promote(testActor(), { diagramId: mermaidBuilder().id });
		expect(diagrams.indexedIds).toEqual([result.promoted.id]);
	});
});
