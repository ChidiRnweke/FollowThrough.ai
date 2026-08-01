import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

const setup = (drawio = false) => {
	const diagrams = new InMemoryDiagrams();
	diagrams.diagrams = [drawio ? drawioBuilder() : mermaidBuilder()];
	return {
		diagrams,
		controller: new Diagrams(
			capabilityDependencies<DiagramsDependencies>({
				diagramFinder: diagrams,
				mermaidReviser: diagrams,
				mermaidRenderer: diagrams,
				textExtractor: diagrams,
				diagramWriter: diagrams,
				diagramIndexer: diagrams
			})
		)
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
