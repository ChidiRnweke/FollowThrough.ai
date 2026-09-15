import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import {
	DrawioXmlValidator,
	DrawioSvgSanitizer,
	DrawioDiagramTextExtractor
} from '$lib/server/services/diagrams/drawio';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const diagrams = new InMemoryDiagrams();
	const original = drawioBuilder();
	diagrams.diagrams = [original];
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			diagramFinder: diagrams,
			diagramWriter: diagrams,
			diagramIndexer: diagrams,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioTextExtractor: new DrawioDiagramTextExtractor(),
			now: () => testNow,
			transactionRunner: new InMemoryTransactionRunner([diagrams])
		})
	);
	const input = {
		diagramId: original.id,
		source: VALID_DRAWIO_XML,
		renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>API</text></svg>'
	};
	return { controller, diagrams, original, input };
};

describe('Studio draw.io saves', () => {
	it('saves searchable text from the new source', async () => {
		const { controller, input } = setup();
		expect((await controller.saveProjectDrawio(testActor(), input)).diagram.searchableText).toBe(
			'API & worker'
		);
	});
	it('indexes the saved diagram', async () => {
		const { controller, diagrams, input } = setup();
		await controller.saveProjectDrawio(testActor(), input);
		expect(diagrams.indexedIds).toEqual([input.diagramId]);
	});
	it('rolls back the diagram when indexing fails', async () => {
		const { controller, diagrams, original, input } = setup();
		diagrams.failIndex = true;
		await controller.saveProjectDrawio(testActor(), input).catch(() => undefined);
		expect(diagrams.diagrams).toEqual([original]);
	});
	it('rejects saving another actor’s diagram', async () => {
		const { controller, input } = setup();
		await expect(controller.saveProjectDrawio(testActor(2), input)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
